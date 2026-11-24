import {readFile} from "node:fs/promises";
import {runScript} from "../local/server/server/script/sandbox.js";

const WORLD = "sp:WorldStudioLab";
const DIM = "minecraft:overworld";
const AIR = "minecraft:air";
const materials = new Set([AIR,"minecraft:andesite","minecraft:stone_bricks","minecraft:waxed_weathered_cut_copper",
  "minecraft:polished_blackstone","minecraft:deepslate_tiles","minecraft:deepslate_bricks",
  "minecraft:polished_deepslate","minecraft:polished_andesite"]);
const skill = new URL("../experiments/sample.js", import.meta.url);
const cellKey = (x,y,z) => `${x},${y},${z}`;
const length = r => r.top - r.y + 1;
const volume = runs => runs.reduce((sum,r) => sum + length(r), 0);

function validPoint({x,y,z}) {
  if (![x,y,z].every(Number.isSafeInteger) || Math.abs(x)>29999984 || Math.abs(z)>29999984 || y < -64 || y > 319)
    throw Error("Tower coordinates exceed the Overworld build area.");
}

function checkRun(r) {
  validPoint(r);
  validPoint({...r,y:r.top});
  if (r.top < r.y || r.top-r.y >= 56 || !materials.has(r.before) || !materials.has(r.after) || r.before === r.after)
    throw Error("Invalid tower edit in the journal.");
}

async function checkSite(client) {
  const status = await client.tool("get_status");
  const screen = await client.tool("get_screen");
  if (!status.integratedServer || status.playerCount !== 1 || status.aiPaused || screen.paused ||
      !screen.inWorld || screen.lastWorldId !== WORLD) throw Error("Resume WorldStudioLab with one active player.");
  const self = await client.tool("get_self");
  if (self.dimension !== DIM || self.gameMode !== "creative") throw Error("Enter the lab Overworld in Creative mode.");
}

// The trusted, checked-in skill also runs in Minecraft. This invocation runs in
// the installed QuickJS runtime with no bridge helpers; chat cannot supply code.
async function geometry(params, origin) {
  const cells = new Map();
  if (!params) return cells;
  const guest = await runScript(await readFile(skill,"utf8"), {helpers:[],call:() => {throw Error("Offline geometry only");}}, {
    args:{...params,sample:"tower",action:"geometry"}, limits:{maxResultChars:128000}
  });
  if (!guest.ok || guest.resultTruncated) throw Error(guest.error?.message || "Incomplete tower geometry");
  for (const [dx,minY,dz,maxY,material] of JSON.parse(guest.result)) {
    const x = origin.x+dx, z = origin.z+dz;
    const id = "minecraft:"+material;
    if (!materials.has(id) || id === AIR) throw Error("Unsupported tower material");
    validPoint({x,y:origin.y+minY,z});
    validPoint({x,y:origin.y+maxY,z});
    for (let y=origin.y+minY;y<=origin.y+maxY;y++) cells.set(cellKey(x,y,z),id);
  }
  return cells;
}

function boundsOf(runs) {
  if (!runs.length) return null;
  const from = {x:Infinity,y:Infinity,z:Infinity}, to = {x:-Infinity,y:-Infinity,z:-Infinity};
  for (const r of runs) {
    from.x=Math.min(from.x,r.x); from.y=Math.min(from.y,r.y); from.z=Math.min(from.z,r.z);
    to.x=Math.max(to.x,r.x); to.y=Math.max(to.y,r.top); to.z=Math.max(to.z,r.z);
  }
  return {from,to};
}

// Read whole slabs, including air. Missing/unloaded cells never become implicit air.
async function scan(client,bounds) {
  const live = new Map();
  if (!bounds) return live;
  const {from,to} = bounds;
  validPoint(from);
  validPoint(to);
  const width=to.x-from.x+1, depth=to.z-from.z+1, height=to.y-from.y+1;
  if (width < 1 || depth < 1 || height < 1 || width>23 || depth>23 || height>56) throw Error("Invalid tower footprint");
  for (let y=from.y;y<=to.y;y+=4) {
    const top=Math.min(y+3,to.y);
    const result=await client.tool("get_blocks_region",{
      dimension:DIM,from:{...from,y},to:{...to,y:top},includeAir:true,includeState:true
    });
    const expected=width*depth*(top-y+1);
    if (result.truncated || result.count!==expected || result.volume!==expected || result.blocks.length!==expected)
      throw Error("Load the whole tower footprint before continuing.");
    for (const b of result.blocks) {
      if (typeof b.state !== "string") throw Error("Tower survey is missing a block state.");
      live.set(cellKey(b.x,b.y,b.z),b.state);
    }
  }
  return live;
}

// Feed individual cells sorted by column and height. The same function packs
// edit cells and occupied/protected spans (which have no before/after fields).
function append(runs,cell) {
  const last = runs.at(-1);
  if (last && last.x === cell.x && last.z === cell.z && last.top+1 === cell.y &&
      last.before === cell.before && last.after === cell.after) {
    last.top=cell.y;
  } else {
    runs.push({...cell,top:cell.y});
  }
}

export async function previewTower(client,origin,previous,next,{exclude=[]}={}) {
  validPoint(origin);
  if (!next) throw Error("A proposed tower needs dimensions.");
  await checkSite(client);
  const old=await geometry(previous,origin), proposed=await geometry(next,origin);
  const footprint = [...new Set([...old.keys(),...proposed.keys()])].map(k => {
    const [x,y,z]=k.split(",").map(Number);
    return {x,y,z,top:y};
  }).sort((a,b)=>a.x-b.x || a.z-b.z || a.y-b.y);
  const bounds=boundsOf(footprint);
  const live=await scan(client,bounds);
  const excludedCells=new Set();
  for (const r of exclude) {
    validPoint(r);
    validPoint({...r,y:r.top});
    for (let y=r.y;y<=r.top;y++) excludedCells.add(cellKey(r.x,y,r.z));
  }
  const runs=[], newlyExcluded=[];
  let protectedCount=0;
  for (const {x,y,z} of footprint) {
    const k=cellKey(x,y,z), before=old.get(k)??AIR, after=proposed.get(k)??AIR;
    if (!live.has(k)) throw Error("Incomplete tower survey.");
    if (excludedCells.has(k)) { protectedCount++; continue; }
    if (live.get(k)!==before) {
      append(newlyExcluded,{x,y,z});
      protectedCount++;
    } else if (before!==after) {
      append(runs,{x,y,z,before,after});
    }
  }
  return {origin,previous,next,bounds,runs,count:volume(runs),protectedCount,excluded:[...exclude,...newlyExcluded]};
}

function splitMatching(run,live,allowed,conflicts) {
  for (let y=run.y;y<=run.top;y++) {
    const k=cellKey(run.x,y,run.z);
    if (!live.has(k)) throw Error("Incomplete tower readback.");
    if (live.get(k) === run.before) append(allowed,{...run,y});
    else append(conflicts,{x:run.x,y,z:run.z});
  }
}

function casCommand(r) {
  const tests = [];
  for (let y=r.y;y<=r.top;y++) tests.push(`if block ${r.x} ${y} ${r.z} ${r.before}`);
  return `execute as WorldStudio at @s if dimension ${DIM} if entity @s[gamemode=creative] `+
    tests.join(" ")+` run fill ${r.x} ${r.y} ${r.z} ${r.x} ${r.top} ${r.z} ${r.after} replace ${r.before}`;
}

export async function applyTower(client,plan,{onBeforeRun,onProgress,signal}={}) {
  for (const r of plan.runs) checkRun(r);
  await checkSite(client);
  const bounds=boundsOf(plan.runs);
  const live=await scan(client,bounds);
  const allowed=[], conflicts=[], applied=[];
  for (const r of plan.runs) splitMatching(r,live,allowed,conflicts);
  for (let i=0;i<allowed.length;i++) {
    const r=allowed[i];
    await checkSite(client);
    signal?.throwIfAborted();
    await onBeforeRun?.(r);
    // All block comparisons and the fill run synchronously in one Minecraft
    // command. A mid-survey edit cannot be partially overwritten by this run.
    const response=await client.tool("run_command",{command:casCommand(r)});
    if (response.success && response.resultValue===length(r)) {
      applied.push(r);
      await onProgress?.({run:r,changed:true});
      continue;
    }
    if (response.success || response.resultValue!==0) throw Error("Uncertain tower write; inspect the in-flight run.");
    // A failed execute condition writes nothing. A fresh scan lets unaffected
    // neighbours proceed; syntax, permission or world changes stop the operation.
    await checkSite(client);
    const fresh=await scan(client,boundsOf([r]));
    const retry=[], missed=[];
    splitMatching(r,fresh,retry,missed);
    if (!missed.length) throw Error("Tower command failed: "+(response.output??[]).join(" "));
    await onProgress?.({run:r,changed:false});
    conflicts.push(...missed);
    allowed.splice(i+1,0,...retry);
  }
  await checkSite(client);
  const observed=await scan(client,boundsOf(applied));
  let verified=0;
  for (const r of applied) for (let y=r.y;y<=r.top;y++) {
    if (observed.get(cellKey(r.x,y,r.z))===r.after) verified++;
  }
  return {written:volume(applied),verified,skipped:volume(conflicts),applied,conflicts};
}

export function reverseTower(applied) {
  const runs=applied.map(r => ({...r,before:r.after,after:r.before})).reverse();
  return {runs,bounds:boundsOf(runs),count:volume(runs)};
}
