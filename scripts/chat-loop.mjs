import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, realpathSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { stripPrefix } from "../local/server/server/channel.js";
import { connect } from "../experiments/client.mjs";
import { askCodex, defaults, parameters, surveyIntent } from "./studio-planner.mjs";
import { surveyBrownRoof } from "./survey-roof.mjs";
import { StudioState } from "./studio-state.mjs";
import { previewTower, applyTower, reverseTower } from "./tower.mjs";

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
const stopFile=join(dir,"stop.request");
if(existsSync(stopFile)) unlinkSync(stopFile);
if(state.active) store.finish(null);
// Older listeners saved uncommitted proposals. Never execute those on upgrade.
if(state.pending) { state.pending=null;store.save(); }
const c=await connect();
let busy, lastPreview, stopping=false, online=false, cursor=0;

const compact = txt => String(txt).replace(/[\u0000-\u001f\u007f§]/g," ").trim();
async function say(text) {
  text=compact(text).slice(0,490);
  console.log(text);
  await c.tool("show_message",{text});
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
async function survey() {
  const self=await context();
  const ray=await c.tool("raycast",{origin:{x:self.x,y:self.y+1.62,z:self.z},yaw:self.yaw,pitch:self.pitch,
    maxDistance:96,includeEntities:false,dimension:DIM});
  if(!state.towers.hillside) {
    // Adopt only the original lab landmark, identified by its actual copper crown.
    const crown=await c.tool("get_block",{x:9,y:135,z:86,dimension:DIM}).catch(()=>null);
    const brim=await c.tool("get_block",{x:15,y:126,z:86,dimension:DIM}).catch(()=>null);
    if([crown,brim].every(b=>b?.id==="minecraft:waxed_weathered_cut_copper")) {
      state.towers.hillside=hillside;
      store.save();
    }
  }
  const hit=ray.hitType==="block"?ray.block:null;
  const pointed=Object.keys(state.towers).find(key=>contains(state.towers[key],hit));
  return {hit,selected:pointed??state.selected,player:{x:self.x,y:self.y,z:self.z,yaw:self.yaw,pitch:self.pitch}};
}

function previewText(p) {
  const {origin:o,next:n,count,protectedCount}=p.plan;
  return `Preview at ${o.x} ${o.y} ${o.z}. ${p.summary} Walls ${n.height} high, radius ${n.radius} to ${n.radius-n.taper}, thickness ${n.thickness}; roof ${n.roof}. ${count} cells would change, ${protectedCount} protected.`;
}
async function outline(p) {
  await context();
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

async function design(request,signal,previewOnly) {
  const site=await survey();
  const objects=Object.fromEntries(Object.entries(state.towers).map(([key,t])=>[key,{origin:t.origin,params:t.params}]));
  await say("Designing with Codex. You can type @studio cancel.");
  const decision=await askCodex({request,site,towers:objects,defaultNewTower:defaults,recent:state.turns,
    previewOnly},signal);
  signal.throwIfAborted();
  await context();
  const summary=compact(decision.message).slice(0,170);
  state.turns=[...state.turns,{request,reply:summary}].slice(-4);
  if(decision.action==="answer") { store.save(); await say(summary||"Please describe the tower or revision.");return; }
  if(state.history.at(-1)?.partial) throw Error("Undo the interrupted revision before proposing another edit.");
  let key, before, origin, base;
  if(decision.action==="new") {
    if(!site.hit) throw Error("Point at solid ground within 96 blocks for a new tower.");
    if(Object.values(state.towers).some(t=>contains(t,site.hit))) throw Error("Aim at the ground for a new tower, or ask to revise this one.");
    origin={x:site.hit.x,y:site.hit.y+1,z:site.hit.z};
    key="tower-"+[origin.x,origin.y,origin.z].join("_"); before=null; base=defaults;
  } else {
    key=decision.target==="hillside"?"hillside":site.selected;
    before=state.towers[key]??null;
    if(before) { origin=before.origin;base=before.params; }
    else throw Error("Point at a known tower or ask for a new tower on the ground.");
  }
  const next=parameters(base,decision);
  // Keep an independently owned tower out of this object's editing footprint.
  for(const [other,t] of Object.entries(state.towers)) {
    if(other===key) continue;
    const radius=next.radius+t.params.radius+2;
    if(Math.abs(origin.x-t.origin.x)<=radius && Math.abs(origin.z-t.origin.z)<=radius &&
      origin.y<t.origin.y+t.params.height+t.params.roof && origin.y+next.height+next.roof>t.origin.y)
      throw Error("That footprint overlaps another Studio tower. Select a different site.");
  }
  const plan=await previewTower(c,origin,before?.params??null,next,{exclude:[...(before?.exclude??[]),...(state.uncertainSpans??[])]});
  signal.throwIfAborted();
  if(!plan.count) { lastPreview=null;store.save();await say(`No editable changes. ${plan.protectedCount} cells are protected.`);return; }
  const p={id:randomBytes(4).toString("hex"),key,before,plan,summary};
  if(previewOnly || decision.previewOnly) {
    await outline(p);
    signal.throwIfAborted();
    lastPreview=p;
    store.save();
    acceptNextInput(signal);
    await say(previewText(p));
    return;
  }
  busy.label="applying "+p.id;
  lastPreview=null;
  await say(`Applying ${plan.count} block changes at ${origin.x} ${origin.y} ${origin.z}. ${plan.protectedCount} protected. Use @studio cancel to stop.`);
  await edit("apply",p,signal);
}

async function edit(direction,entry,signal) {
  await context();
  const plan=direction==="apply"?entry.plan:reverseTower(entry.applied);
  signal.throwIfAborted();
  store.begin(direction,entry);
  let receipt,result;
  try { result=await applyTower(c,plan,{...store.callbacks(signal),surveyed:entry.kind==="survey"}); }
  finally { receipt=store.finish(result); }
  acceptNextInput(signal);
  const verb=direction==="apply"?"Applied":"Undid";
  await say(`${verb} ${entry.id}: ${receipt.written} cells changed, ${result.verified} verified; ${result.skipped} changed since preview or commit and preserved.`);
}
async function surveyedEdit(request,signal) {
  await context();
  await say("Surveying the roof from the blocks in your view.");
  const {action}=await surveyIntent(request,signal);
  if(!["paint","inspect"].includes(action)) {await say("This survey supports roof inspection and a dark-to-light brown recolor.");return;}
  const plan=await surveyBrownRoof(c,signal);
  signal.throwIfAborted();
  if(!plan.count || action==="inspect") {await say(`Survey complete. ${plan.count} eligible roof blocks for recoloring.`);return;}
  if(state.history.at(-1)?.partial) throw Error("Undo the interrupted revision before editing again.");
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
  const task={label,abort};
  busy=task;
  task.done=work(abort.signal).catch(async e=>{
    console.error(label,e.message);
    const advice=state.history.at(-1)?.partial?" Type @studio undo to recover confirmed writes.":"";
    const unknown=state.lastUncertain;
    const detail=unknown?` Inspect the uncertain column at ${unknown.run.x} ${unknown.run.y} ${unknown.run.z}.`:"";
    const error=abort.signal.aborted?"Cancelled.":e.message.startsWith("Codex could not")?"Codex could not finish the design turn. Check the listener log.":e.message;
    await say((error+advice+detail).slice(0,450)).catch(()=>{});
  }).finally(()=>{ if(busy===task)busy=null; });
}
function recoveryNote() {
  const messages=[];
  if(state.history.at(-1)?.partial) messages.push("An interrupted revision has confirmed writes. Use @studio undo.");
  const r=state.lastUncertain?.run;
  if(r) messages.push("An unacknowledged column is protected. Inspect "+r.x+" "+r.y+" "+r.z+" through y="+r.top+".");
  return messages.join(" ");
}
async function handle(input) {
  const body=input.trim();
  const cmd=body.toLowerCase();
  if(cmd==="status" || cmd==="help") {
    await say(busy ? "Working: "+busy.label :
      recoveryNote() || "Studio ready. Point and ask @studio build a watchtower here, or @studio make the hillside roof two blocks taller. Use @studio undo after a revision.");
    return;
  }
  if(cmd==="cancel" || cmd==="stop") {
    if(busy) {busy.abort.abort();await say("Stopping the current request.");}
    else {lastPreview=null;await say("Studio is idle.");}
    return;
  }
  if(busy) {await say("One request is active. Use @studio status or @studio cancel.");return;}
  if(/^survey\b/i.test(body)) {start("surveying",s=>surveyedEdit(body,s));return;}
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
  start("designing",s=>design(previewOnly?body.slice(7).trim():body,s,previewOnly));
}

function shutdown() { stopping=true;busy?.abort.abort(); }
process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
try {
  while(!stopping && !existsSync(stopFile)) {
    try {
      if(!online) {
        await context();
        cursor=(await c.tool("poll_events",{limit:1})).lastId;
        state.cursor=cursor;store.save(); online=true;
        await say(("Studio ready. Type @studio followed by a request. Use @studio status for help. "+recoveryNote()).trim());
      }
      const batch=await c.tool("poll_events",{types:["chat","left_world"],sinceId:cursor,limit:500});
      if(batch.lastId<cursor) { online=false;busy?.abort.abort();continue; }
      for(const e of batch.events) {
        if(e.id<=cursor) continue;
        cursor=e.id;
        if(e.type==="left_world") {online=false;busy?.abort.abort();break;}
        const d=e.data;
        if(e.type!=="chat" || d?.kind!=="chat" || d.self!==true || d.sender!=="WorldStudio" || typeof d.text!=="string") continue;
        const input=stripPrefix(d.text,"@studio");
        if(!input) continue;
        // Consume before dispatch so a crash cannot replay a build request.
        state.cursor=cursor;store.save();
        await handle(input);
      }
      await sleep(300);
    } catch(e) {
      if(online) {console.error("Studio disconnected:",e.message);busy?.abort.abort();}
      online=false;
      await sleep(1200);
    }
  }
} finally {
  shutdown();await busy?.done;await c.close();lock.close();
  if(existsSync(stopFile))unlinkSync(stopFile);
}
