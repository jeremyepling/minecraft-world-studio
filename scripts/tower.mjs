import {towerCells, brownRoofMaterial} from "../packages/geometry/tower.ts";
import {isSurveyMaterial} from "./survey-roof.mjs";
import {bridgeCells} from "../packages/geometry/bridge.ts";
import {weatheringMaterials} from "../packages/geometry/materials.ts";

const WORLD = "sp:WorldStudioLab";
const DIM = "minecraft:overworld";
const AIR = "minecraft:air";
const materials = new Set([AIR,"minecraft:andesite","minecraft:stone_bricks","minecraft:waxed_weathered_cut_copper",
  "minecraft:polished_blackstone","minecraft:deepslate_tiles","minecraft:deepslate_bricks",
  "minecraft:polished_deepslate","minecraft:polished_andesite"]);
const brownPlanks=new Set(["minecraft:dark_oak_planks","minecraft:spruce_planks","minecraft:jungle_planks","minecraft:oak_planks"]);
for (const id of brownPlanks) materials.add(id);
for (const id of weatheringMaterials) materials.add("minecraft:"+id);
const cellKey = (x,y,z) => `${x},${y},${z}`;
const length = r => r.top - r.y + 1;
const volume = runs => runs.reduce((sum,r) => sum + length(r), 0);

function validPoint({x,y,z}) {
  if (![x,y,z].every(Number.isSafeInteger) || Math.abs(x)>29999984 || Math.abs(z)>29999984 || y < -64 || y > 319)
    throw Error("Build coordinates exceed the Overworld build area.");
}

function checkRun(r,surveyed) {
  validPoint(r);
  validPoint({...r,y:r.top});
  const allowed=surveyed
    ? (brownPlanks.has(r.after) && isSurveyMaterial(r.before)) || (brownPlanks.has(r.before) && isSurveyMaterial(r.after))
    : materials.has(r.before) && materials.has(r.after);
  if (r.top < r.y || r.top-r.y >= 56 || !allowed || r.before === r.after)
    throw Error("Invalid block edit in the journal.");
}

async function checkSite(client) {
  const status = await client.tool("get_status");
  const screen = await client.tool("get_screen");
  if (!status.integratedServer || status.playerCount !== 1 || status.aiPaused || screen.paused ||
      !screen.inWorld || screen.lastWorldId !== WORLD) throw Error("Resume WorldStudioLab with one active player.");
  const self = await client.tool("get_self");
  if (self.dimension !== DIM || self.gameMode !== "creative") throw Error("Enter the lab Overworld in Creative mode.");
}

function geometry(params, origin, generate) {
  const cells = new Map();
  if (!params) return cells;
  for (const cell of generate(params)) {
    const x=origin.x+cell.x, y=origin.y+cell.y, z=origin.z+cell.z;
    const id = "minecraft:"+cell.material;
    if (!materials.has(id) || id === AIR) throw Error("Unsupported design material");
    validPoint({x,y,z});
    cells.set(cellKey(x,y,z),id);
  }
  return cells;
}

export function boundsOf(runs) {
  if (!runs.length) return null;
  const from = {x:Infinity,y:Infinity,z:Infinity}, to = {x:-Infinity,y:-Infinity,z:-Infinity};
  for (const r of runs) {
    from.x=Math.min(from.x,r.x); from.y=Math.min(from.y,r.y); from.z=Math.min(from.z,r.z);
    to.x=Math.max(to.x,r.x); to.y=Math.max(to.y,r.top); to.z=Math.max(to.z,r.z);
  }
  return {from,to};
}

// Older releases recorded blind repaints separately from parameter edits. Only a
// receipt for the complete generated cap can establish its new expected finish.
// Keep this derived until an edit commits so undoing the survey still works.
export function recordedParameters(key,tower,history) {
  const {origin,params}=tower;
  const base={entrance:"north",...params};
  if(base.roofFinish==="brown_to_tan")return base;
  const bottom=origin.y+params.height;
  const radius=params.radius-params.taper+1;
  for(let i=history.length-1;i>=0;i--) {
    const entry=history[i];
    if(entry.key===key)break;
    if(entry.kind!=="survey")continue;
    const bounds=entry.plan?.bounds;
    if(!bounds || bounds.from.x>origin.x+radius || bounds.to.x<origin.x-radius ||
       bounds.from.z>origin.z+radius || bounds.to.z<origin.z-radius ||
       bounds.from.y>bottom+params.roof-1 || bounds.to.y<bottom)continue;
    if(entry.partial || bounds.from.y!==bottom || bounds.to.y!==bottom+params.roof-1)return base;
    const expected=new Map();
    for(const {x,y,z,material} of towerCells(base)) {
      if(y<params.height)continue;
      expected.set(cellKey(origin.x+x,origin.y+y,origin.z+z),{
        before:"minecraft:"+material,after:"minecraft:"+brownRoofMaterial(x,z,(y-params.height)/(params.roof-1))
      });
    }
    for(const run of entry.applied)for(let y=run.y;y<=run.top;y++) {
      const k=cellKey(run.x,y,run.z), cell=expected.get(k);
      if(!cell || cell.before!==run.before || cell.after!==run.after)return base;
      expected.delete(k);
    }
    return expected.size===0 ? {...base,roofFinish:"brown_to_tan"} : base;
  }
  return base;
}

// Read whole slabs, including air. Missing/unloaded cells never become implicit air.
async function scan(client,bounds) {
  const live = new Map();
  if (!bounds) return live;
  const {from,to} = bounds;
  validPoint(from);
  validPoint(to);
  const width=to.x-from.x+1, depth=to.z-from.z+1, height=to.y-from.y+1;
  if (width < 1 || depth < 1 || height < 1 || width>64 || depth>64 || height>56) throw Error("Invalid build footprint");
  const layers=Math.max(1,Math.min(4,Math.floor(4096/(width*depth))));
  for (let y=from.y;y<=to.y;y+=layers) {
    const top=Math.min(y+layers-1,to.y);
    const result=await client.tool("get_blocks_region",{
      dimension:DIM,from:{...from,y},to:{...to,y:top},includeAir:true,includeState:true,limit:4096
    });
    const expected=width*depth*(top-y+1);
    if (result.truncated || result.count!==expected || result.volume!==expected || result.blocks.length!==expected)
      throw Error("Load the whole build footprint before continuing.");
    for (const b of result.blocks) {
      if (typeof b.state !== "string") throw Error("Build survey is missing a block state.");
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

export function previewTower(client,origin,previous,next,options) {
  return previewDesign(towerCells,client,origin,previous,next,options);
}

export function previewBridge(client,origin,previous,next,options) {
  return previewDesign(bridgeCells,client,origin,previous,next,options);
}

// Use one surface sample per column under the actual curved deck. Count exposed
// water through the existing bridge, stopping at terrain that conceals a lower pool.
export async function surveyBridgeWaterline(client,origin,next,previous) {
  await checkSite(client);
  const footprint=designRuns("bridge",origin,next);
  const bounds=boundsOf(footprint);
  bounds.from.y=Math.max(-64,origin.y+Math.min(0,next.dy)-8);
  bounds.to.y=Math.min(319,origin.y+Math.max(0,next.dy)+1);
  const live=await scan(client,bounds);
  const existing=geometry(previous,origin,bridgeCells);
  const sampled=new Set(), heights=new Map();
  for(const {x,z} of footprint) {
    const column=x+","+z;
    if(sampled.has(column))continue;
    sampled.add(column);
    for(let y=bounds.to.y;y>=bounds.from.y;y--) {
      const key=cellKey(x,y,z), block=live.get(key);
      if(typeof block!=="string")throw Error("Incomplete bridge water survey.");
      if(block===AIR || block===existing.get(key))continue;
      if(block==="minecraft:water" || block.startsWith("minecraft:water[")) {
        heights.set(y,(heights.get(y)??0)+1);
      }
      break;
    }
  }
  if(!heights.size)return null;
  const [[waterY]]=[...heights].sort(([ay,an],[by,bn])=>bn-an || by-ay);
  return waterY-origin.y;
}

export function designRuns(kind,origin,params) {
  const voxels=geometry(params,origin,kind==="bridge"?bridgeCells:towerCells);
  return Array.from(voxels,([k,after])=>{
    const [x,y,z]=k.split(",").map(Number);
    return {x,y,z,top:y,after};
  });
}

async function previewDesign(generate,client,origin,previous,next,{exclude=[]}={}) {
  validPoint(origin);
  if (!next) throw Error("A proposed build needs dimensions.");
  await checkSite(client);
  const old=geometry(previous,origin,generate), proposed=geometry(next,origin,generate);
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
    if (!live.has(k)) throw Error("Incomplete build survey.");
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
    if (!live.has(k)) throw Error("Incomplete build readback.");
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

export async function applyDesign(client,plan,{onBeforeRun,onProgress,signal,surveyed=false}={}) {
  for (const r of plan.runs) checkRun(r,surveyed);
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
    if (response.success || response.resultValue!==0) throw Error("Uncertain build write. Inspect the in-flight run.");
    // A failed execute condition writes nothing. A fresh scan lets unaffected
    // neighbours proceed; syntax, permission or world changes stop the operation.
    await checkSite(client);
    const fresh=await scan(client,boundsOf([r]));
    const retry=[], missed=[];
    splitMatching(r,fresh,retry,missed);
    if (!missed.length) throw Error("Build command failed: "+(response.output??[]).join(" "));
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

export function reverseDesign(applied) {
  const runs=applied.map(r => ({...r,before:r.after,after:r.before})).reverse();
  return {runs,bounds:boundsOf(runs),count:volume(runs)};
}

export {applyDesign as applyTower, reverseDesign as reverseTower};
