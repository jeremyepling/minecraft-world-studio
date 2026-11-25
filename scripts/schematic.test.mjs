import test from "node:test";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {exportSchematic} from "./schematic.mjs";

test("WorldEdit export preserves a signed placement offset and x-fastest voxel order",()=>{
  const origin={x:0,y:70,z:0};
  const runs=[
    {x:-1,y:70,z:4,top:71,after:"minecraft:stone_bricks"},
    {x:0,y:70,z:5,top:70,after:"minecraft:andesite"}
  ];
  const bytes=gunzipSync(exportSchematic(runs,origin));
  assert.ok(bytes.includes(Buffer.from("0b00064f726967696e00000003000000000000004600000000","hex")));
  assert.ok(bytes.includes(Buffer.from("0b00064f666673657400000003ffffffff0000000000000004","hex")));
  // Two layers of a 2x2 footprint, including explicit holes.
  assert.ok(bytes.includes(Buffer.from("07000444617461000000080100000201000000","hex")));
  assert.throws(()=>exportSchematic(runs,{...origin,x:0.5}),/integer origin/);
  assert.throws(()=>exportSchematic([],origin),/at least one block/);
});
