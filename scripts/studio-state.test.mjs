import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {StudioState} from "./studio-state.mjs";
import {parameters,defaults} from "./studio-planner.mjs";

const column={x:9,y:120,top:122,z:86,before:"minecraft:air",after:"minecraft:stone_bricks"};
const entry={id:"test",key:"hillside",before:null,plan:{origin:{x:9,y:96,z:86},next:defaults,excluded:[]}};
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),"studio-journal-test-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return new StudioState(dir);
}

test("bridge registration survives restart and undo restores both its previous design and protected cells",t=>{
  const store=setup(t);
  delete store.data.bridges;store.save(); // Existing tower-only session.
  const session=new StudioState(store.directory);
  const bridge={id:"make",kind:"bridge",key:"bridge-1",banks:["West","East"],before:null,
    designBounds:{from:{x:0,y:60,z:-2},to:{x:18,y:67,z:4}},
    plan:{origin:{x:0,y:63,z:0},next:{dx:18,dy:0,dz:0,width:3,arch:3,bend:2},excluded:[]}};
  function apply(s,e) {
    s.begin("apply",e);s.receipt({before:column});s.receipt({done:column,changed:true});s.finish({conflicts:[]});
  }
  apply(session,bridge);
  const resumed=new StudioState(store.directory);
  const before=resumed.data.bridges[bridge.key];
  assert.deepEqual(before.banks,bridge.banks);
  assert.deepEqual(before.bounds,bridge.designBounds);
  const revision={...bridge,id:"widen",before,plan:{...bridge.plan,next:{...bridge.plan.next,width:5}}};
  apply(resumed,revision);
  const manual={x:9,y:120,z:86,top:120};
  resumed.begin("undo",resumed.data.history.at(-1));resumed.finish({conflicts:[manual]});
  assert.deepEqual(resumed.data.bridges[bridge.key],{...before,exclude:[manual]});
  resumed.begin("undo",resumed.data.history[0]);resumed.finish({conflicts:[]});
  assert.deepEqual(resumed.data.bridges,{});
  assert.deepEqual(resumed.data.towers,{});
});

test("survey recolors and their undo have receipts without claiming a generated object", t=>{
  const store=setup(t);
  const generated={origin:{x:0,y:60,z:0},params:defaults,exclude:[]};
  store.data.towers.existing=generated;
  store.data.selected="existing";
  const run={x:2,y:70,top:71,z:3,before:"minecraft:bricks",after:"minecraft:dark_oak_planks"};
  const surveyed={id:"sample",kind:"survey",plan:{runs:[run]}};
  store.begin("apply",surveyed);
  store.receipt({before:run});store.receipt({done:run,changed:true});
  store.finish({conflicts:[]});
  assert.deepEqual(store.data.history[0].applied,[run]);
  assert.deepEqual(store.data.towers,{existing:generated});
  store.begin("undo",store.data.history[0]);
  const inverse={...run,before:run.after,after:run.before};
  store.receipt({before:inverse});store.receipt({done:inverse,changed:true});
  store.finish({conflicts:[]});
  assert.deepEqual(store.data.history,[]);
  assert.equal(store.data.selected,"existing");
  assert.deepEqual(store.data.towers,{existing:generated});
});

test("a rejected conditional fill can retry unaffected siblings without abandoning ownership", t=>{
  const store=setup(t);
  store.begin("apply",entry);
  store.receipt({before:column});
  store.receipt({done:column,changed:false});
  const allowed={...column,y:121};
  store.receipt({before:allowed});
  store.receipt({done:allowed,changed:true});
  const conflict={x:9,y:120,top:120,z:86};
  assert.equal(store.finish({conflicts:[conflict]}).written,2);
  const reloaded=new StudioState(store.directory);
  assert.deepEqual(reloaded.data.history.at(-1).applied,[allowed]);
  assert.deepEqual(reloaded.data.towers.hillside.exclude,[conflict]);
});

test("restart records confirmed writes and permanently protects an unacknowledged column", t=>{
  const store=setup(t);
  store.begin("apply",entry);
  store.receipt({before:column});
  store.receipt({done:column,changed:true});
  const inFlight={...column,z:87};
  store.receipt({before:inFlight});
  const resumed=new StudioState(store.directory);
  resumed.finish(null);
  assert.equal(resumed.data.history[0].partial,true);
  assert.deepEqual(resumed.data.history[0].applied,[column]);
  assert.deepEqual(resumed.data.uncertainSpans,[inFlight]);
  assert.equal(resumed.data.active,undefined);
});

test("interrupted undo retains exactly the cells still eligible for checked reversal", t=>{
  const store=setup(t);
  store.begin("apply",entry);
  store.receipt({before:column});
  store.receipt({done:column,changed:true});
  store.finish({conflicts:[]});
  store.begin("undo",store.data.history.at(-1));
  const middle={...column,y:121,top:121,before:column.after,after:column.before};
  store.receipt({before:middle});
  store.receipt({done:middle,changed:true});
  store.finish(null);
  assert.deepEqual(store.data.history.at(-1).applied,[{...column,top:120},{...column,y:122}]);
});

test("a relative revision retains unmodified parameters and rejects oversized generations", ()=>{
  assert.deepEqual(parameters(defaults,{height:null,roof:14}),{...defaults,roof:14});
  assert.throws(()=>parameters(defaults,{radius:500}));
  const legacy={...defaults};
  delete legacy.entrance;
  assert.equal(parameters(legacy,{roof:14}).entrance,"north");
  const south=parameters(legacy,{entrance:"south"});
  assert.equal(parameters(south,{roof:14,entrance:null}).entrance,"south");
  assert.throws(()=>parameters(south,{entrance:"up"}),/cardinal/);
});
