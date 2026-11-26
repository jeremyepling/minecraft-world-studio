import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, realpathSync, unlinkSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { stripPrefix } from "../local/server/server/channel.js";
import { connect } from "../experiments/client.mjs";
import { createPlanner, defaults, parameters } from "./studio-planner.mjs";
import { createVoice } from "./studio-voice.mjs";
import { StudioSession, coordinates, inside, selectionName } from "./studio-session.mjs";
import { surveyBrownRoof } from "./survey-roof.mjs";
import { StudioState } from "./studio-state.mjs";
import { previewTower, previewBridge, applyDesign, reverseDesign, recordedParameters, designRuns, boundsOf, surveyBridgeWaterline } from "./tower.mjs";
import {bridgeParameters,bridgeDefaults} from "../packages/geometry/bridge.ts";
import {architecturalFinish} from "./architectural-finish.mjs";
import {exportSchematic} from "./schematic.mjs";

const WORLD="sp:WorldStudioLab", DIM="minecraft:overworld";
const hillside={origin:{x:9,y:96,z:86},params:{...defaults,roof:10},exclude:[]};
const argv=process.argv.slice(2);
if(argv.length && !(argv.length===2 && argv[0]==="--test-state" && /^[a-z0-9-]{1,48}$/i.test(argv[1]))) {
  throw Error("Usage: node scripts/chat-loop.mjs [--test-state LABEL]");
}
const local=realpathSync(fileURLToPath(new URL("../local/",import.meta.url)));
const dir=join(local,argv.length?"chat-loop-test-"+argv[1]:"chat-loop");
// One listener per bridge, including fixtures. Windows releases the named pipe on exit.
const lock=createServer(socket=>socket.destroy());
const lockName="\\\\.\\pipe\\worldstudio-chat-"+createHash("sha256").update(local.toLowerCase()).digest("hex").slice(0,20);
await new Promise((resolve,reject)=>{ lock.once("error",()=>reject(Error("Another World Studio listener is active."))); lock.listen(lockName,resolve); });
const store=new StudioState(dir), state=store.data;
const scope={world:WORLD,dimension:DIM,player:"WorldStudio"};
const session=new StudioSession(dir,scope,state.turns);
const makePlanner=(provider,model=session.data.models?.[provider])=>
  createPlanner({directory:dir,provider,model,world:WORLD,player:scope.player});
let planner=makePlanner(session.data.provider);
const stopFile=join(dir,"stop.request");
if(existsSync(stopFile)) unlinkSync(stopFile);
if(state.active) store.finish(null);
// Older listeners saved uncommitted proposals. Never execute those on upgrade.
if(state.pending) { state.pending=null;store.save(); }
const c=await connect();
let shadowQuestion;
let busy, lastPreview, stopping=false, online=false, cursor=0;
let incoming=Promise.resolve();
const voice=createVoice({directory:dir,instanceDirectory:join(local,"instance"),
  authorize:async()=>{
    if(!online || stopping)return false;
    await context();
    return (await c.tool("get_screen")).screen==="none";
  },
  onStatus:async message=>{if(online && !stopping)await say(message);},
  onText:async text=>{
    if(!online || stopping)return;
    const body=compact(text).replace(/^@?studio\b[:,]?\s*/i,"").replace(/[.!?]+$/,"").trim();
    if(body.startsWith("/")){await say("Voice takes Studio requests. Type Minecraft slash commands in chat.");return;}
    await dispatch(body,true);
  }});

const compact = txt => String(txt).replace(/[\u0000-\u001f\u007f§]/g," ").trim();
async function say(text) {
  text=compact(text).slice(0,490);
  console.log(text);
  await c.tool("show_message",{text});
}
async function reply(text) {
  session.record("assistant",text);
  await say(text);
  voice.speak(text);
}
function activity(label) {
  if(!busy || stopping || busy.abort.signal.aborted)return;
  busy.progress=compact(label).slice(0,140);
  if(Date.now()-busy.lastNotice<10000)return;
  busy.lastNotice=Date.now();
  void say("Working: "+busy.progress).catch(()=>{});
}

async function context() {
  const [status,screen]=await Promise.all([c.tool("get_status"),c.tool("get_screen")]);
  if(!screen.inWorld || screen.lastWorldId!==WORLD || !status.integratedServer || status.playerCount!==1)
    throw Error("Open WorldStudioLab in singleplayer.");
  const self=await c.tool("get_self");
  if(self.dimension!==DIM || self.gameMode!=="creative" || status.aiPaused || screen.paused)
    throw Error("Resume the lab in Creative mode in the Overworld.");
  return self;
}
function contains(t,p) {
  const o=t.origin, n=t.params;
  return p && Math.abs(p.x-o.x)<=n.radius+1 && Math.abs(p.z-o.z)<=n.radius+1 &&
    p.y>=o.y && p.y<o.y+n.height+n.roof;
}
async function viewRay() {
  const self=await context();
  const eyeY=self.y+(self.sneaking?1.27:1.62);
  const ray=await c.tool("raycast",{origin:{x:self.x,y:eyeY,z:self.z},yaw:self.yaw,pitch:self.pitch,
    maxDistance:96,includeEntities:false,dimension:DIM});
  return {hit:ray.hitType==="block"?ray.block:null,player:{x:self.x,y:self.y,eyeY,z:self.z,yaw:self.yaw,pitch:self.pitch}};
}
async function highlight(point) {
  const pos=[point.x+0.5,point.y+1.2,point.z+0.5].join(" ");
  const r=await c.tool("run_command",{command:"execute in minecraft:overworld run particle minecraft:end_rod "+pos+" .18 .45 .18 .015 32 force WorldStudio"});
  return r.success;
}

async function saveMarker(name,hit,move) {
  const point=session.mark(name,hit,move);
  const lit=await highlight(point).catch(()=>false);
  await say("Marked "+point.name+" at "+coordinates(point)+" ("+point.block+")."+(lit?"":" Highlight unavailable."));
}

async function menuMarker(body) {
  const match=body.match(/^menu (mark|move) (-?\d+) (-?\d+) (-?\d+) (.+)$/i);
  if(!match)throw Error("Reopen the Studio menu and choose a block and marker name.");
  const [,action,rawX,rawY,rawZ,name]=match;
  const [x,y,z]=[rawX,rawY,rawZ].map(Number);
  const self=await context();
  // Measure to the nearest point on the captured block, including faces at maximum reach.
  const distance=(eye,min)=>Math.max(min-eye,0,eye-min-1);
  if(Math.hypot(distance(self.x,x),distance(self.y+(self.sneaking?1.27:1.62),y),distance(self.z,z))>96)
    throw Error("The marked block is now out of range. Aim at it and reopen the menu.");
  const block=await c.tool("get_block",{x,y,z,dimension:DIM});
  if(!block.id || block.air || block.id==="minecraft:air")throw Error("That block is now empty. Aim again.");
  await saveMarker(name,{x,y,z,id:block.id},action.toLowerCase()==="move");
}
async function survey() {
  const view=await viewRay();
  if(!state.towers.hillside) {
    // Adopt only the original lab landmark, identified by its actual copper crown.
    const crown=await c.tool("get_block",{x:9,y:135,z:86,dimension:DIM}).catch(()=>null);
    const brim=await c.tool("get_block",{x:15,y:126,z:86,dimension:DIM}).catch(()=>null);
    if([crown,brim].every(b=>b?.id==="minecraft:waxed_weathered_cut_copper")) {
      state.towers.hillside=hillside;
      store.save();
    }
  }
  const s=session.data.selection;
  const anchor=s && !s.to?session.marker(s.from):null;
  const point=anchor??view.hit;
  const pointed=Object.keys(state.towers).find(key=>contains(state.towers[key],point)) ??
    Object.keys(state.bridges).find(key=>point && inside(state.bridges[key].bounds,point));
  const previous=state.history.at(-1);
  const lastEdit=previous?{id:previous.id,kind:previous.kind??"tower",object:previous.key??null,
    bounds:previous.plan.bounds,count:previous.plan.count,partial:previous.partial}:null;
  return {...view,selected:pointed??(anchor?null:state.selected),world:WORLD,dimension:DIM,lastEdit,
    markers:session.data.markers,selection:session.data.selection,region:session.region()};
}

function bridgeFinish(plan) {
  const {weathering,waterline}=plan.next;
  if(!weathering || weathering==="none")return "";
  const site=waterline==null?"dry foundation":"waterline Y "+(plan.origin.y+waterline);
  return ` Stone finish: ${weathering} (${site}).`;
}

function previewText(p) {
  const {origin:o,next:n,count,protectedCount}=p.plan;
  if(p.kind==="bridge") {
    return `Bridge preview between ${p.banks.join(" and ")}. Width ${n.width}, arch rise ${n.arch}, bend ${n.bend}.${bridgeFinish(p.plan)} ${count} cells would change, ${protectedCount} protected.`;
  }
  return `Preview at ${o.x} ${o.y} ${o.z}. Walls ${n.height} high, radius ${n.radius} to ${n.radius-n.taper}, thickness ${n.thickness}. Roof ${n.roof} high. Entrance faces ${n.entrance}. ${count} cells would change, ${protectedCount} protected. ${p.summary}`.trim();
}
async function outline(p) {
  await context();
  if(p.kind==="bridge") {
    // Sample deck heights from the actual proposed voxel geometry to show both banks and the arc.
    const deck=new Map();
    for(const r of designRuns("bridge",p.plan.origin,p.plan.next)) {
      const k=r.x+","+r.z;
      if(!deck.has(k) || deck.get(k).y<r.top)deck.set(k,{x:r.x,y:r.top,z:r.z});
    }
    const sorted=[...deck.values()].sort((a,b)=>a.x-b.x || a.z-b.z);
    const step=Math.max(1,Math.ceil(sorted.length/60));
    const points=sorted.filter((_,i)=>i%step===0);
    await c.tool("run_script",{args:{points},code:`for(const p of mc.args.points)await mc.run_command({command:"execute in minecraft:overworld run particle minecraft:end_rod "+(p.x+.5)+" "+(p.y+1.1)+" "+(p.z+.5)+" 0 0 0 0 1 force WorldStudio"});`});
    return;
  }
  // Particle positions are a read-only visual guide for the massing. No blocks occupy the outline.
  const code=`const {origin:o,next:n}=mc.args;
    const tiers=[[0,n.radius],[n.height-1,n.radius-n.taper],[n.height,n.radius-n.taper+1],[n.height+n.roof-1,0]];
    for(const [dy,r] of tiers) {
      const samples=r?16:1;
      for(let i=0;i<samples;i++) {
        const angle=2*Math.PI*i/samples;
        const x=(o.x+.5+r*Math.cos(angle)).toFixed(2),z=(o.z+.5+r*Math.sin(angle)).toFixed(2);
        await mc.run_command({command:"execute in minecraft:overworld run particle minecraft:end_rod "+x+" "+(o.y+dy+.6)+" "+z+" 0 .08 0 0 2 force WorldStudio"});
      }
    }`;
  await c.tool("run_script",{code,args:{origin:p.plan.origin,next:p.plan.next}});
}

// Publishing a final HUD reply is the hand-off to the next player input.
function acceptNextInput(signal) {
  if(busy?.abort.signal===signal) busy=null;
}

async function design(request,signal,previewOnly,observeOnly=false) {
  const site=await survey();
  const objects=Object.fromEntries(Object.entries(state.towers).map(([key,t])=>[key,{origin:t.origin,params:recordedParameters(key,t,state.history)}]));
  await say(`Working with ${planner.provider}. Use @studio cancel or @studio redirect <request>.`);
  let image;
  if(observeOnly) {
    if(!planner.capabilities.images)throw Error("The selected provider does not support images.");
    image=await c.tool("screenshot");
    if(!Buffer.isBuffer(image))throw Error("Minecraft did not return a screenshot.");
  }
  const recent=session.recent.slice(0,-1);
  const bridges=Object.fromEntries(Object.entries(state.bridges).map(([key,b])=>[key,{banks:b.banks,origin:b.origin,params:b.params}]));
  const decision=await planner.ask({request,site,towers:objects,bridges,defaultNewBridge:bridgeDefaults,defaultNewTower:defaults,recent,
    shadowQuestion:shadowQuestion?.key,observeOnly,previewOnly},signal,activity,image);
  signal.throwIfAborted();
  await context();
  const summary=compact(decision.message).slice(0,450);
  if(observeOnly || decision.action==="answer") {
    shadowQuestion=null;
    acceptNextInput(signal);await reply(summary||"Please describe the tower or revision.");return;
  }
  if(state.history.at(-1)?.partial) throw Error("Undo the interrupted revision before proposing another edit.");
  if(decision.continueShadow) {
    if(!shadowQuestion || !decision.light || decision.light==="ask")throw Error("Please point at the structure and specify the light source.");
    const light=decision.light;
    Object.assign(decision,shadowQuestion.decision,{light});
    site.selected=shadowQuestion.key;
    site.selection=null;
    decision.target="selected";
    decision.marker=decision.fromMarker=decision.toMarker=null;
    decision.action=state.bridges[site.selected]?"revise_bridge":"revise";
    previewOnly ||= shadowQuestion.previewOnly;
    shadowQuestion=null;
  }
  if(decision.light==="ask") {
    let key=decision.target==="hillside"?"hillside":site.selected;
    if(decision.fromMarker && decision.toMarker) {
      const names=[decision.fromMarker,decision.toMarker].map(n=>n.toLowerCase());
      key=Object.keys(state.bridges).find(k=>state.bridges[k].banks.every(n=>names.includes(n.toLowerCase())));
    }
    if(!state.towers[key] && !state.bridges[key])throw Error("Aim at the tower or bridge you want to shade.");
    shadowQuestion={key,decision,previewOnly:previewOnly||decision.previewOnly};
    acceptNextInput(signal);await reply("Where should the light come from: your position, the direction you face, directly overhead, or a compass direction?");return;
  }
  shadowQuestion=null;
  const isBridge=decision.action==="new_bridge" || decision.action==="revise_bridge";
  const p=isBridge?await planBridge(site,decision):await planTower(site,objects,decision);
  const {plan}=p;
  signal.throwIfAborted();
  checkSelection(plan);
  if(!plan.count) { lastPreview=null;acceptNextInput(signal);await reply(`No editable changes. ${plan.protectedCount} cells are protected.`);return; }
  p.id=randomBytes(4).toString("hex");
  p.summary=summary;
  if(previewOnly || decision.previewOnly) {
    await outline(p);
    signal.throwIfAborted();
    lastPreview=p;
    acceptNextInput(signal);
    await reply(previewText(p));return;
  }
  busy.label="applying "+p.id;
  lastPreview=null;
  await say(`Applying ${plan.count} block changes at ${coordinates(plan.origin)}. ${plan.protectedCount} protected. Use @studio cancel to stop.`);
  await edit("apply",p,signal);
}

function intersects(a,b) {
  return ["x","y","z"].every(k=>a.from[k]<=b.to[k] && a.to[k]>=b.from[k]);
}

function towerBounds(t) {
  const {origin:o,params:n}=t,r=n.radius+1;
  return {from:{x:o.x-r,y:o.y,z:o.z-r},to:{x:o.x+r,y:o.y+n.height+n.roof-1,z:o.z+r}};
}

async function planBridge(site,d) {
  const revising=d.action==="revise_bridge";
  if(Boolean(d.fromMarker)!==Boolean(d.toMarker))throw Error("Name both bank markers.");
  let key=site.selected,before,origin,banks,base;
  if(d.fromMarker && d.toMarker) {
    const names=[d.fromMarker,d.toMarker].map(name=>name.trim().toLowerCase());
    if(names[0]===names[1])throw Error("Choose two distinct bank markers.");
    const found=Object.entries(state.bridges).find(([,b])=>b.banks.every(name=>names.includes(name.toLowerCase())));
    key=found?.[0];
  }
  if(revising) {
    before=state.bridges[key];
    if(!before)throw Error("Aim at a registered bridge or name its two banks.");
    ({origin,banks,params:base}=before);
  } else {
    if(!d.fromMarker || !d.toMarker)throw Error("Mark both banks and name them in the bridge request.");
    if(key)throw Error("A bridge already connects those bank names. Ask for a revision.");
    const a=session.marker(d.fromMarker), b=session.marker(d.toMarker);
    for(const m of [a,b]) {
      const block=await c.tool("get_block",{x:m.x,y:m.y,z:m.z,dimension:DIM});
      if(!block.id || block.air || block.id==="minecraft:air")throw Error("The bank at "+m.name+" is empty. Move the marker to its landing.");
    }
    origin={x:a.x,y:a.y+1,z:a.z};
    banks=[a.name,b.name];
    key="bridge-"+randomBytes(6).toString("hex");
    base={...bridgeDefaults,dx:b.x-a.x,dy:b.y-a.y,dz:b.z-a.z};before=null;
  }
  const next=bridgeParameters({...architecturalFinish(base,d,site,origin),width:d.width??base.width,arch:d.arch??base.arch,bend:d.bend??base.bend,
    weathering:d.weathering??base.weathering??"none"});
  if(next.weathering==="none")next.waterline=null;
  else if(!base.weathering || base.weathering==="none") {
    next.waterline=await surveyBridgeWaterline(c,origin,next,before?.params??null);
  }
  const plan=await previewBridge(c,origin,before?.params??null,next,{exclude:[...(before?.exclude??[]),...(state.uncertainSpans??[])]});
  const designBounds=boundsOf(designRuns("bridge",origin,next));
  if(Object.values(state.towers).some(t=>intersects(towerBounds(t),designBounds)) ||
      Object.entries(state.bridges).some(([k,b])=>k!==key && intersects(b.bounds,designBounds)))
    throw Error("The proposed bridge overlaps another registered build.");
  return {kind:"bridge",key,banks,designBounds,before,plan};
}

async function planTower(site,objects,decision) {
  const anchor=decision.marker?session.marker(decision.marker):
    (site.selection && !site.selection.to?session.marker(site.selection.from):null);
  if(anchor) {
    const reference=await c.tool("get_block",{x:anchor.x,y:anchor.y,z:anchor.z,dimension:DIM});
    site.hit={x:anchor.x,y:anchor.y,z:anchor.z,id:reference.id};
    if(!reference.id || reference.air || reference.id==="minecraft:air")throw Error("The block at marker "+anchor.name+" is now empty. Move the marker first.");
    site.selected=Object.keys(state.towers).find(key=>contains(state.towers[key],site.hit));
  }
  let key, before, origin, base;
  if(decision.action==="new") {
    if(!site.hit) throw Error("Point at solid ground within 96 blocks for a new tower.");
    if(Object.values(state.towers).some(t=>contains(t,site.hit))) throw Error("Aim at the ground for a new tower, or ask to revise this one.");
    origin={x:site.hit.x,y:site.hit.y+1,z:site.hit.z};
    key="tower-"+[origin.x,origin.y,origin.z].join("_"); before=null; base=defaults;
  } else {
    key=!anchor && decision.target==="hillside"?"hillside":site.selected;
    before=state.towers[key]??null;
    if(before) { origin=before.origin;base=objects[key].params; }
    else throw Error("Point at a known tower or ask for a new tower on the ground.");
  }
  const next=parameters(architecturalFinish(base,decision,site,origin),decision);
  // Keep an independently owned tower out of this object's editing footprint.
  for(const [other,t] of Object.entries(state.towers)) {
    if(other===key) continue;
    const radius=next.radius+t.params.radius+2;
    if(Math.abs(origin.x-t.origin.x)<=radius && Math.abs(origin.z-t.origin.z)<=radius &&
      origin.y<t.origin.y+t.params.height+t.params.roof && origin.y+next.height+next.roof>t.origin.y)
      throw Error("That footprint overlaps another Studio tower. Select a different site.");
  }
  const plan=await previewTower(c,origin,before?base:null,next,{exclude:[...(before?.exclude??[]),...(state.uncertainSpans??[])]});
  if(Object.values(state.bridges).some(b=>intersects(b.bounds,plan.bounds)))throw Error("The tower footprint overlaps a registered bridge.");
  return {key,before,plan};
}

function checkSelection(plan) {
  const region=session.region();
  if(region && plan.runs.some(r=>!inside(region,r) || !inside(region,{...r,y:r.top})))
    throw Error("That edit crosses the selected region. Change the selection or use @studio select clear.");
}

async function edit(direction,entry,signal) {
  await context();
  const plan=direction==="apply"?entry.plan:reverseDesign(entry.applied);
  signal.throwIfAborted();
  store.begin(direction,entry);
  let receipt,result;
  const callbacks=store.callbacks(signal);
  let written=0;
  try { result=await applyDesign(c,plan,{...callbacks,surveyed:entry.kind==="survey",onProgress:async event=>{
    await callbacks.onProgress(event);
    if(event.changed)written+=event.run.top-event.run.y+1;
    activity(`${direction==="undo"?"Undoing":"Applying"} ${entry.id}: ${written} of ${plan.count} blocks`);
  }}); }
  finally { receipt=store.finish(result); }
  acceptNextInput(signal);
  const verb=direction==="apply"?"Applied":"Undid";
  const finish=direction==="apply" && entry.kind==="bridge"?bridgeFinish(plan):"";
  await reply(`${verb} ${entry.id}: ${receipt.written} cells changed, ${result.verified} verified; ${result.skipped} changed since preview or commit and preserved.${finish}`);
}
async function surveyedEdit(request,signal) {
  await context();
  await say("Surveying the roof from the blocks in your view.");
  const {action}=await planner.survey(request,signal,activity);
  if(!["paint","inspect"].includes(action)) {await say("This survey supports roof inspection and a dark-to-light brown recolor.");return;}
  const plan=await surveyBrownRoof(c,signal);
  signal.throwIfAborted();
  if(!plan.count || action==="inspect") {await say(`Survey complete. ${plan.count} eligible roof blocks for recoloring.`);return;}
  if(state.history.at(-1)?.partial) throw Error("Undo the interrupted revision before editing again.");
  checkSelection(plan);
  if((state.uncertainSpans??[]).some(s=>plan.runs.some(r=>r.x===s.x && r.z===s.z && r.y<=s.top && r.top>=s.y)))
    throw Error("Survey intersects an unacknowledged write. Inspect the area before editing.");
  const entry={id:randomBytes(4).toString("hex"),kind:"survey",plan};
  busy.label="recoloring the surveyed roof";
  lastPreview=null;
  await say(`Applying the brown gradient to ${plan.count} surveyed blocks.`);
  await edit("apply",entry,signal);
}
function start(label,work) {
  const abort=new AbortController();
  const task={label,abort,lastNotice:Date.now()};
  busy=task;
  task.done=work(abort.signal).catch(async e=>{
    console.error(label,e.message);
    const advice=state.history.at(-1)?.partial?" Type @studio undo to recover confirmed writes.":"";
    const unknown=state.lastUncertain;
    const detail=unknown?` Inspect the uncertain column at ${unknown.run.x} ${unknown.run.y} ${unknown.run.z}.`:"";
    const error=abort.signal.aborted?"Cancelled.":e.message.startsWith("Codex could not")?"Codex could not finish the design turn. Check the listener log.":e.message;
    if(online && !stopping)await reply((error+advice+detail).slice(0,450)).catch(()=>{});
  }).finally(()=>{
    if(busy===task)busy=null;
    if(task.next && !busy && online && !stopping)void dispatch(task.next);
  });
}
function recoveryNote() {
  const messages=[];
  if(state.history.at(-1)?.partial) messages.push("An interrupted revision has confirmed writes. Use @studio undo.");
  const r=state.lastUncertain?.run;
  if(r) messages.push("An unacknowledged column is protected. Inspect "+r.x+" "+r.y+" "+r.z+" through y="+r.top+".");
  return messages.join(" ");
}
async function dispatch(input,spoken=false) {
  const run=async()=>{
    if(!online || stopping)return;
    try {
      await context();
      if(spoken)await say("You said: "+compact(input).slice(0,220));
      await handle(input);
    } catch(error) {
      console.error("Player request:",error.message);
      if(online && !stopping)await say(error.message).catch(()=>{});
    }
  };
  incoming=incoming.then(run,run);
  await incoming;
}
async function handle(input) {
  const body=input.trim();
  if(!body)return;
  const cmd=body.toLowerCase();
  if(cmd==="help") {
    await say("Ask @studio a question or request a build. Commands include mark NAME, markers, select NAME, select A to B, where, look QUESTION, export schematic, voice on/off, spoken on/off, provider, session, history, status, cancel, redirect REQUEST, preview and undo.");
    return;
  }
  if(cmd==="status" || cmd==="session") {
    await say(busy ? "Working: "+(busy.progress??busy.label) :
      `Studio ready. Provider: ${planner.provider}. Selection: ${selectionName(session.data.selection)}. ${session.count} saved messages. ${recoveryNote() || "Use @studio help for commands."}`);
    return;
  }
  if(cmd==="cancel" || cmd==="stop") {
    shadowQuestion=null;
    voice.quiet();
    if(busy) {busy.next=null;busy.abort.abort();await say("Stopping the current request.");}
    else {lastPreview=null;await say("Studio is idle.");}
    return;
  }
  const redirect=body.match(/^redirect\s+(.+)$/i);
  if(redirect) {
    voice.quiet();
    if(busy) {
      busy.next=redirect[1];busy.abort.abort();
      await say("Stopping this request, then starting: "+redirect[1]);return;
    }
    return handle(redirect[1]);
  }
  const speech=cmd.match(/^(voice|spoken)(?:\s+(on|off|status))?$/);
  if(speech) {await say(await voice.configure(speech[1],speech[2]??"status"));return;}
  if(busy) {await say("One request is active. Use @studio status, @studio cancel or @studio redirect <request>.");return;}
  if(cmd==="export schematic" || cmd==="export preview schematic") {
    if(state.history.at(-1)?.partial)throw Error("Undo the interrupted revision before exporting a design.");
    let kind,params,origin;
    if(cmd==="export preview schematic") {
      if(!lastPreview)throw Error("Preview a build first to export that design.");
      kind=lastPreview.kind??"tower";params=lastPreview.plan.next;origin=lastPreview.plan.origin;
    } else {
      const key=(await survey()).selected;
      const bridge=state.bridges[key],object=bridge??state.towers[key];
      if(!object)throw Error("Aim at a registered tower or bridge to export its design.");
      kind=bridge?"bridge":"tower";origin=object.origin;
      params=bridge?object.params:recordedParameters(key,object,state.history);
    }
    const name="studio_"+kind+"_"+randomBytes(5).toString("hex");
    const folder=join(local,"instance","config","worldedit","schematics");
    const bytes=exportSchematic(designRuns(kind,origin,params),origin);
    await mkdir(folder,{recursive:true});
    await writeFile(join(folder,name+".schem"),bytes,{flag:"wx"});
    await say("Exported the generated "+kind+" design. Load it with //schem load "+name+".schem, then use //paste -a at your chosen placement point. WorldEdit records its own undo.");
    return;
  }
  if(cmd==="provider" || cmd.startsWith("provider ")) {
    const [name,model,...extra]=body.slice(8).trim().split(/\s+/);
    if(!name) {await say("Provider: "+planner.provider+". Available: codex, mock, ollama MODEL.");return;}
    if(!["codex","mock","ollama"].includes(name) || extra.length || (model && !/^[\w./:-]{1,120}$/.test(model)) || (model && name==="mock"))
      throw Error("Choose @studio provider codex, mock, or ollama MODEL.");
    if(name==="ollama" && !model && !session.data.models?.ollama)throw Error("Include your installed local model: @studio provider ollama MODEL.");
    if(name!==planner.provider || (model && model!==session.data.models?.[name])) {
      const replacement=makePlanner(name,model??session.data.models?.[name]);
      await planner.close();
      planner=replacement;session.data.provider=name;
      if(model){session.data.models??={};session.data.models[name]=model;}
      session.save();
    }
    await say("Provider: "+planner.provider+".");return;
  }
  if(cmd==="history") {
    await say(session.recent.slice(-3).map(t=>(t.role==="user"?"You":"Studio")+": "+t.text.slice(0,124)).join(" | ") || "No saved conversation yet.");return;
  }
  if(cmd==="where") {
    const {hit}=await viewRay();
    await say(`Looking at ${hit?hit.id+" at "+coordinates(hit):"open space"}. Selection: ${selectionName(session.data.selection)}.`);return;
  }
  const mark=body.match(/^(mark|move marker)\s+(.+)$/i);
  if(mark)return saveMarker(mark[2],(await viewRay()).hit,mark[1].toLowerCase()==="move marker");
  if(/^menu\s+(mark|move)\b/i.test(body))return menuMarker(body);
  if(/^markers(?:\s+\d+)?$/.test(cmd)) {
    const page=Number(cmd.split(/\s+/)[1]??1);
    const all=session.data.markers, pages=Math.max(1,Math.ceil(all.length/5));
    if(page<1 || page>pages)throw Error("There are "+pages+" marker pages.");
    const list=all.slice((page-1)*5,page*5).map(m=>m.name+" ("+coordinates(m)+")");
    await say("Markers: "+(list.join(", ")||"none")+(pages>1?` · page ${page}/${pages}`:""));return;
  }
  const forget=body.match(/^forget marker\s+(.+)$/i);
  if(forget){await say("Forgot marker "+session.forget(forget[1])+".");return;}
  const select=body.match(/^select\s+(.+)$/i);
  if(select) {
    const s=session.select(select[1]);
    if(!s)await say("Selection cleared.");
    else if(s.to)await say("Selected "+selectionName(s)+" from "+coordinates(session.region().from)+" to "+coordinates(session.region().to)+".");
    else await say("Selected "+s.from+" at "+coordinates(session.marker(s.from))+".");
    return;
  }
  const locate=body.match(/^locate\s+(.+)$/i);
  if(locate) {
    const m=session.marker(locate[1]);
    if(!await highlight(m))throw Error("The marker could not be highlighted. Its coordinates are "+coordinates(m)+".");
    await say("Marker "+m.name+" at "+coordinates(m)+".");return;
  }
  if(/^survey\b/i.test(body)) {
    session.record("user",body);
    start("surveying",s=>surveyedEdit(body,s));return;
  }
  if(/^(approve|reject)\b/.test(cmd)) {
    await say("Build requests apply directly. Type @studio followed by the change you want.");return;
  }
  if(cmd==="undo") {
    const last=state.history.at(-1);
    if(!last){await say("No Studio revision to undo.");return;}
    lastPreview=null;start("undoing "+last.id,s=>edit("undo",last,s));return;
  }
  if(cmd==="preview") {
    if(lastPreview) start("showing the preview",async signal=>{
      const p=lastPreview;
      await outline(p);
      signal.throwIfAborted();
      acceptNextInput(signal);
      await say(previewText(p));
    });
    else await say("Type @studio preview followed by the change you want to see.");
    return;
  }
  const previewOnly=/^preview\s/i.test(body);
  const look=body.match(/^look(?:\s+(.+))?$/i);
  const request=look?(look[1]??"Describe what you can see in this Minecraft screenshot."):previewOnly?body.slice(7).trim():body;
  session.record("user",body);
  start(look?"inspecting the current view":"designing",s=>design(request,s,previewOnly,!!look));
}

function disconnect() {
  shadowQuestion=null;
  online=false;
  voice.disconnect();
  if(busy){busy.next=null;busy.abort.abort();}
}
function shutdown() { stopping=true;disconnect(); }
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
try {
  while(!stopping && !existsSync(stopFile)) {
    try {
      if(!online) {
        await context();
        cursor=(await c.tool("poll_events",{limit:1})).lastId;
        state.cursor=cursor;store.save(); online=true;voice.connect();
        await say(("Studio ready. Type @studio followed by a request. Use @studio status for help. "+recoveryNote()).trim());
      }
      const batch=await c.tool("poll_events",{types:["chat","left_world"],sinceId:cursor,limit:500});
      if(batch.lastId<cursor) { disconnect();continue; }
      for(const e of batch.events) {
        if(e.id<=cursor) continue;
        cursor=e.id;
        if(e.type==="left_world") {disconnect();break;}
        const d=e.data;
        if(e.type!=="chat" || d?.kind!=="chat" || d.self!==true || d.sender!=="WorldStudio" || typeof d.text!=="string") continue;
        const input=stripPrefix(d.text,"@studio");
        if(!input) continue;
        // Consume before dispatch so a crash cannot replay a build request.
        state.cursor=cursor;store.save();
        await dispatch(input);
      }
      await sleep(300);
    } catch(e) {
      if(online) {console.error("Studio disconnected:",e.message);disconnect();}
      await sleep(1200);
    }
  }
} finally {
  const task=busy;
  shutdown();await incoming;await task?.done;await voice.close();await planner.close();await c.close();lock.close();
  if(existsSync(stopFile))unlinkSync(stopFile);
}
