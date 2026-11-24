import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connect } from "./client.mjs";

const client = await connect();
const p = (x,y,z) => ({x:x-79,y:y+200,z:z+21});
const bounds = {from:p(-1,-1,-1),to:p(27,5,14),includeAir:true,includeState:true};
const stone = "minecraft:smooth_stone";
const brick = "minecraft:bricks";
const sky = "minecraft:air";
const colors = ["white","orange","red","magenta"].map(c=>"minecraft:"+c+"_concrete");
const stair = "minecraft:oak_stairs[facing=east,half=bottom]";
const stats = {};
try {
  const screen = await client.tool("get_screen");
  assert.ok(screen.inWorld && screen.lastWorldId === "sp:WorldStudioLab");
  assert.equal((await client.tool("get_self")).dimension,"minecraft:overworld");
  const scan = async () => {
    const r = await client.tool("get_blocks_region",bounds);
    assert.equal(r.count, 29*7*16);
    assert.equal(r.truncated,false);
    return r.blocks;
  };
  const before = await scan();
  assert.ok(before.every(b => b.id === sky), "Reserved one-shot plot is occupied");
  async function fill(from,to,blockId) {
    const r = await client.tool("fill_blocks",{from,to,blockId});
    assert.ok(r.success,JSON.stringify(r));
  }
  await fill(p(0,0,0),p(9,0,9),stone);
  await fill(p(11,0,0),p(13,2,2),brick);
  await fill(p(15,0,0),p(18,3,3),"minecraft:calcite");
  await fill(p(16,1,1),p(17,2,2),sky);
  await fill(p(0,0,12),p(8,3,12),brick);
  await fill(p(1,0,12),p(2,2,12),sky);
  await fill(p(5,2,12),p(6,2,12),sky);
  for (let i=0;i<4;i++) {
    await fill(p(11+i,i,12),p(11+i,i,13),stair);
    await fill(p(21+i,0,0),p(21+i,2,1),colors[i]);
  }
  for (const block of await scan()) {
    const x = block.x+79, y = block.y-200, z = block.z-21;
    let expected=sky, kind="untouched or deliberately empty";
    if (x>=0 && x<10 && y===0 && z>=0 && z<10) { expected=stone; kind="platform"; }
    if (x>=11 && x<=13 && y>=0 && y<=2 && z>=0 && z<=2) { expected=brick; kind="cube"; }
    if (x>=15 && x<=18 && y>=0 && y<=3 && z>=0 && z<=3 && (x===15||x===18||y===0||y===3||z===0||z===3)) {
      expected="minecraft:calcite"; kind="hollow shell";
    }
    if (x>=0 && x<=8 && z===12 && y>=0 && y<=3 && !(x>=1&&x<=2&&y<=2) && !(x>=5&&x<=6&&y===2)) {
      expected=brick; kind="wall";
    }
    if (x>=11 && x<=14 && y===x-11 && (z===12||z===13)) {
      expected="minecraft:oak_stairs"; kind="staircase";
      assert.ok(block.state.includes("facing=east") && block.state.includes("half=bottom"));
    }
    if (x>=21 && x<=24 && y>=0 && y<=2 && z>=0 && z<=1) { expected=colors[x-21]; kind="colors"; }
    assert.equal(block.id,expected,JSON.stringify(block));
    stats[kind]=(stats[kind]??0)+1;
  }
  console.log(stats);
  await writeFile(new URL("../docs/basic-readback.json",import.meta.url),JSON.stringify({bounds,verified:stats},null,2)+"\n");
} finally { await client.close(); }
