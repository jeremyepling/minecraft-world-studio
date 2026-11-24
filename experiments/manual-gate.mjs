// Run after the human has placed the two blocks in Axiom as described in docs/experiments.md.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {connect} from "./client.mjs";
const c=await connect();
try {
  const worldId="sp:WorldStudioLab",screen=await c.tool("get_screen");
  assert.equal(screen.lastWorldId,worldId); assert.equal(screen.inWorld,true);
  const args={worldId,sample:"gate",origin:{x:56,y:167,z:50},previous:{revision:3},revision:2};
  const code=await readFile(new URL("sample.js",import.meta.url),"utf8");
  const scan=()=>c.tool("get_blocks_region",{dimension:"minecraft:overworld",from:{x:55,y:167,z:49},
    to:{x:69,y:177,z:51},includeAir:true,includeState:true});
  const read=(r,x,y,z)=>r.blocks.find(b=>b.x===x&&b.y===y&&b.z===z)?.id;
  const markers=r=>{
    assert.equal(r.volume,495); assert.equal(r.count,r.volume); assert.equal(r.truncated,false);
    assert.equal(read(r,57,167,50),"minecraft:diamond_block","Interior Axiom override missing");
    assert.equal(read(r,69,167,50),"minecraft:lapis_block","Exterior Axiom edit missing");
  };
  const step=async action=>{
    const text=await c.tool("run_script",{code,args:{...args,action},timeoutSeconds:300});
    return JSON.parse(text.split("result: ")[1].split("\n")[0]);
  };
  const before=await scan();
  markers(before);
  assert.equal(read(before,56,173,50),"minecraft:stone_bricks","Expected the taller revision-3 wall");
  const preview=await step("inspect");
  assert.equal(preview.protectedCount,1); assert.ok(preview.pending>0);
  const applied=await step("apply"), verified=await step("inspect");
  assert.equal(verified.pending,0); assert.equal(verified.protectedCount,1);
  const after=await scan();
  markers(after);
  assert.equal(read(after,56,173,50),"minecraft:air","Expected the shorter revision-2 wall");
  await writeFile(new URL("../local/manual-gate-readbacks.json",import.meta.url),JSON.stringify({before,preview,applied,verified,after},null,2));
  console.log("PASS",applied.updated,"cells changed; both Axiom blocks preserved, 495 cells read twice.");
} finally {await c.close();}
