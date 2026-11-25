import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,unlink} from "node:fs/promises";
import {join} from "node:path";
import {previewBridge,previewTower,applyDesign,reverseDesign} from "../scripts/tower.mjs";
import {towerCells} from "../packages/geometry/tower.ts";
import {bridgeCells} from "../packages/geometry/bridge.ts";
import {exportSchematic} from "../scripts/schematic.mjs";
import {openFixture,command,snapshot,expected,compare,logReply,receipt,origin,shape,air} from "../experiments/bridge-fixture.mjs";

const {client,local,directory}=await openFixture("bridge-backends");
const report={case:"architecture-backends",phase:"preflight",params:shape,
  methodology:"One local run per method. Each starts from the same independently checked plot. Both survey a guarded delta and verify the full plotted volume. WorldEdit pastes changed solids using -a -o; explicit removals use guarded fill. End-to-end includes plan, prepare/write/load/paste and independent readback. No model calls.",
  modelCalls:0,trials:[]};
const timedClient={tool:async(name,args)=>{
  calls[name]=(calls[name]??0)+1;
  return client.tool(name,args);
}};
let calls={};
const stamp=()=>performance.now();
const ms=start=>Math.round((stamp()-start)*100)/100;
const count=runs=>runs.reduce((n,r)=>n+r.top-r.y+1,0);
const delta=(a,b)=>[...a].filter(([key,v])=>b.get(key)!==v).length;
const schems=join(local,"instance/config/worldedit/schematics");
async function we(command,feedback) {
  return logReply(local,async()=>{
    const r=await timedClient.tool("send_chat",{message:command});
    assert.ok(r.sent);
  },line=>feedback.test(line),12000);
}
async function paste(runs,pivot,result) {
  const filename="studio_bridge_trial_"+randomUUID()+".schem", file=join(schems,filename);
  const start=stamp(), buf=exportSchematic(runs,pivot);
  await mkdir(schems,{recursive:true});
  await writeFile(file,buf,{flag:"wx"});
  result.encodeWriteMs=ms(start);result.schematicBytes=buf.length;
  try {
    let begin=stamp();
    await we("//schem load "+filename,/loaded.*paste/i);result.loadMs=ms(begin);
    begin=stamp();await we("//paste -a -o",/has been pasted/i);result.pasteMs=ms(begin);
  } finally {await unlink(file);}
}
async function execute(workload,method,phase,before,after,expectedBefore,expectedAfter) {
  calls={};
  const trial={design:workload.name,method,phase,independentVolume:expectedAfter.size}, start=stamp();
  report.trials.push(trial);
  const plan=await workload.preview(timedClient,workload.pivot,before,after);
  trial.planMs=ms(start);trial.changedCells=plan.count;
  assert.equal(plan.count,delta(expectedBefore,expectedAfter));
  trial.guardedRuns=plan.runs.length;
  const applyStart=stamp();
  let result;
  if(method==="guarded-fills") {
    result=await applyDesign(timedClient,plan);
    assert.equal(result.verified,plan.count);
  } else {
    const clear=plan.runs.filter(r=>r.after===air), solids=plan.runs.filter(r=>r.after!==air);
    trial.clearedWithGuards=count(clear);trial.pastedSolidCells=count(solids);
    if(clear.length) {
      result=await applyDesign(timedClient,{...plan,runs:clear});assert.equal(result.verified,count(clear));
    }
    await paste(solids,workload.pivot,trial);
  }
  trial.applyMs=ms(applyStart);
  const readStart=stamp();compare(await snapshot(timedClient),expectedAfter,method+" "+phase);
  trial.readbackMs=ms(readStart);trial.endToEndMs=ms(start);
  trial.callsByTool={...calls};trial.mcpCalls=Object.values(calls).reduce((a,b)=>a+b,0);
  return {result,trial};
}

async function undo(method,operation,want,manual) {
  calls={};
  const start=stamp(), t=operation.trial;
  if(method==="worldedit-schematic")await we("//undo",/Undid 1 available edits/i);
  if(operation.result)await applyDesign(timedClient,reverseDesign(operation.result.applied));
  const observed=await snapshot(timedClient), verify=new Map(want);
  if(manual) {
    const live=observed.get(manual);
    t.undoPreservedLaterEdit=live==="minecraft:sea_lantern";
    // WorldEdit stores its undo history per paste. A guarded undo skips a
    // differing live cell; native history can restore its old block over it.
    if(method==="guarded-fills")assert.ok(t.undoPreservedLaterEdit);
    if(t.undoPreservedLaterEdit)verify.set(manual,"minecraft:sea_lantern");
  }
  compare(observed,verify,"undo "+method+" "+t.phase);
  t.undoAndReadbackMs=ms(start);t.undoCallsByTool={...calls};t.undoVerified=true;
}

async function changeFixtureCell(k,before,after) {
  const pos=k.replaceAll(","," ");
  await command(client,"execute if block "+pos+" "+before+" run setblock "+pos+" "+after);
}
async function runWorkload(workload,baseline) {
  const {params,next,generate,pivot}=workload;
  const original=expected(baseline,params,generate,pivot), revised=expected(baseline,next,generate,pivot);
  const changedSolid=[...revised].find(([k,v])=>original.get(k)!==v && v!==air);
  assert.ok(changedSolid);
  const postEdit=changedSolid[0];
  const preEdit=[...original].find(([k,v])=>k!==postEdit && v!==air && revised.get(k)!==v);
  assert.ok(preEdit);
  for(const method of ["guarded-fills","worldedit-schematic"]) {
    report.phase=workload.name+" "+method+" fresh";
    const initial=await execute(workload,method,"fresh",null,params,baseline,original);
    await changeFixtureCell(preEdit[0],preEdit[1],"minecraft:gold_block");
    const protectedOriginal=new Map(original).set(preEdit[0],"minecraft:gold_block");
    const protectedRevised=new Map(revised).set(preEdit[0],"minecraft:gold_block");
    report.phase=workload.name+" "+method+" revision";
    const revision=await execute(workload,method,workload.revision,params,next,protectedOriginal,protectedRevised);
    revision.trial.preexistingManualEditPreserved=true;
    await changeFixtureCell(postEdit,changedSolid[1],"minecraft:sea_lantern");
    await undo(method,revision,protectedOriginal,postEdit);
    if(revision.trial.undoPreservedLaterEdit)await changeFixtureCell(postEdit,"minecraft:sea_lantern",protectedOriginal.get(postEdit));
    await changeFixtureCell(preEdit[0],"minecraft:gold_block",preEdit[1]);
    await undo(method,initial,baseline);
  }
}
try {
  const baseline=await snapshot(client);
  assert.ok([...baseline.values()].every(id=>id===air),"Use a fresh, loaded copy of the fixture plot.");
  const tower={height:12,radius:5,taper:1,thickness:1,roof:4,entrance:"north"};
  await runWorkload({name:"bridge",generate:bridgeCells,preview:previewBridge,pivot:origin,
    params:shape,next:{...shape,width:5},revision:"width-3-to-5"},baseline);
  await runWorkload({name:"tower",generate:towerCells,preview:previewTower,pivot:{x:16,y:206,z:86},
    params:tower,next:{...tower,entrance:"south"},revision:"turn-doorway"},baseline);
  report.phase="pass";
} catch(error) {report.error=String(error);throw error;}
finally {await client.close();await receipt(directory,report);}
