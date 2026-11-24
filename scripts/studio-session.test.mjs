import test from "node:test";
import assert from "node:assert/strict";
import {appendFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {StudioSession,inside} from "./studio-session.mjs";

const scope={world:"sp:Lab",dimension:"minecraft:overworld",player:"Local"};
function fixture(t,legacy) {
  const dir=mkdtempSync(join(tmpdir(),"studio-session-test-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return {session:new StudioSession(dir,scope,legacy),dir};
}
const block=(x,y,z)=>({x,y,z,id:"minecraft:stone"});

test("marker selection survives restart, tracks explicit moves and clears on deletion",t=>{
  const {session:s,dir}=fixture(t);
  s.mark("North bank",block(19,4,-2));
  s.mark("River",block(2,7,20));
  assert.throws(()=>s.mark("north BANK",block(1,2,3)),/already exists/);
  s.select("north BANK to RIVER");
  const r=new StudioSession(dir,scope);
  assert.deepEqual(r.region(),{from:{x:2,y:4,z:-2},to:{x:19,y:7,z:20}});
  r.mark("north bank",block(9,6,6),true);
  assert.ok(inside(r.region(),{x:8,y:7,z:9}));
  assert.equal(inside(r.region(),{x:8,y:8,z:9}),false);
  r.forget("RIVER");assert.equal(r.data.selection,null);
  assert.throws(()=>r.select("missing"),/Unknown marker/);
  assert.equal(r.marker("north bank").name,"North bank");
  assert.throws(()=>new StudioSession(dir,{...scope,world:"sp:Other"}),/different player, world or dimension/);
});
test("recover the neutral transcript after a torn append and import old turns once",t=>{
  const {session:s,dir}=fixture(t,[{request:"our roof?",reply:"brown"}]);
  for(let i=0;i<20;i++)s.record("user","note "+i);
  appendFileSync(s.log,'{"partial":');
  const restored=new StudioSession(dir,scope,[{request:"our roof?",reply:"brown"}]);
  assert.equal(restored.count,22);
  assert.equal(restored.recent.length,16);
  restored.record("assistant","resumed");
  assert.equal(new StudioSession(dir,scope).recent.at(-1).text,"resumed");
});
test("reject ambiguous names, invalid hits and implicit marker moves",t=>{
  const {session:s}=fixture(t);
  for(const name of ["","clear","From to Road","bad;name"])assert.throws(()=>s.mark(name,block(1,2,3)));
  assert.throws(()=>s.mark("Road",null),/Aim at a block/);
  assert.throws(()=>s.mark("Road",block(1,2,3),true),/Unknown marker/);
  s.mark("Road",block(1,2,3));s.select("Road");
  assert.equal(s.select("clear"),null);
});
