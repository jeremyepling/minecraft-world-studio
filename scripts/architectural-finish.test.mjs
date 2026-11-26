import test from "node:test";
import assert from "node:assert/strict";
import {architecturalFinish} from "./architectural-finish.mjs";

test("resolve eye position relative to the build and retain prior finish on unrelated changes",()=>{
  const origin={x:12,y:70,z:-8}, site={player:{x:15.5,y:73,eyeY:74.27,z:1.5,yaw:90}};
  const painted=architecturalFinish({drips:true},{light:"player"},site,origin);
  assert.deepEqual(painted.shadowSource,{x:3.5,y:74.27-70,z:9.5});
  assert.equal(painted.drips,true);
  assert.equal(painted.shadowVariation,true);
  const legacy={...painted};
  delete legacy.shadowVariation;
  assert.deepEqual(architecturalFinish(legacy,{light:null},site,origin),legacy);
  assert.deepEqual(architecturalFinish(legacy,{light:"existing"},site,origin),painted);
  assert.deepEqual(architecturalFinish(painted,{light:null,drips:null},site,origin),painted);
  const facing=architecturalFinish(painted,{light:"facing"},site,origin);
  assert.ok(facing.shadowSource.x < 0 && Math.abs(facing.shadowSource.z)<1e-8);
  assert.equal(architecturalFinish(painted,{light:"remove"},site,origin).shadowSource,null);
});
