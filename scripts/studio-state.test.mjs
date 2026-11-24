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
});
