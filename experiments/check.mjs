// Fixed in-memory test terrain; uses the release's actual QuickJS engine.
import assert from "node:assert/strict";
import {readFile, writeFile} from "node:fs/promises";
import {runScript} from "../local/server/server/script/sandbox.js";

const worldId="sp:WorldStudioLab", origin={x:0,y:0,z:0};
const source = Object.fromEntries(await Promise.all(["sample","road"].map(async k =>
  [k,await readFile(new URL(k+".js",import.meta.url),"utf8")])));
const values=new Map();
let terrain=false;
const get = (x,y,z) => values.get([x,y,z].join(",")) ??
  (terrain && y <= Math.floor(x/10) ? (y===Math.floor(x/10)?"grass_block":"dirt") : "air");
async function bridge(name,p) {
  if (name==="get_screen") return {inWorld:true,lastWorldId:worldId};
  if (name==="get_block") return {id:"minecraft:"+get(p.x,p.y,p.z)};
  if (name==="get_blocks_region") {
    const blocks=[];
    for (let y=p.from.y;y<=p.to.y;y++) for (let x=p.from.x;x<=p.to.x;x++) for(let z=p.from.z;z<=p.to.z;z++)
      blocks.push({x,y,z,id:"minecraft:"+get(x,y,z)});
    return {blocks,count:blocks.length,volume:blocks.length,truncated:false};
  }
  if (name==="run_command") {
    const w=p.command.split(" ");
    let count=0;
    if(w[4]==="fill") {
      const [x,y,z,tx,ty,tz]=w.slice(5,11).map(Number);
      for(let i=x;i<=tx;i++) for(let j=y;j<=ty;j++) for(let k=z;k<=tz;k++)
        if(get(i,j,k)===w[13].slice(10)) {values.set([i,j,k].join(","),w[11].slice(10));count++;}
    } else if(w[3]==="if" && w[4]==="block" && w[10]==="setblock") {
      const [x,y,z]=w.slice(5,8).map(Number);
      if(get(x,y,z)===w[8].slice(10)) {values.set([x,y,z].join(","),w[14].slice(10));count++;}
    } else throw Error("Unexpected fixture command "+p.command);
    return {success:count>0,resultValue:count};
  }
  throw Error("Unexpected bridge call "+name);
}
async function run(name,p) {
  const r=await runScript(source[name],{call:bridge,helpers:["get_screen","get_block","get_blocks_region","run_command"]},
    {args:{origin,worldId,action:"apply",...p}});
  assert.equal(r.ok,true,JSON.stringify(r.error));
  return JSON.parse(r.result);
}
const report={scope:"Stock QuickJS with in-memory block observations. No game, rendering, or bridge timing."};
const tower=await run("sample",{sample:"tower"});
assert.equal(tower.updated,2059);
assert.equal(get(0,3,-7),"air"); // Entrance
assert.equal(get(0,8,0),"air"); // Interior
assert.equal(get(0,38,0),"waxed_weathered_cut_copper");
report.tower=tower;
const variants=[];
for (const p of [{height:35},{radius:8},{taper:3},{thickness:1},{roof:13}]) {
  const v=await run("sample",{sample:"tower",action:"describe",...p});
  assert.notEqual(v.blocks,tower.designed);
  variants.push({...p,...v});
}
report.towerVariants=variants;
report.walls=[];
for(let style=0;style<=4;style++) {
  values.clear();
  const r=await run("sample",{sample:"wall",style});
  assert.equal(r.updated,158);
  let matches=0;
  for(let y=0;y<9;y++)for(let x=1;x<17;x++) if(get(x,y,0)===get(x-1,y,0)) matches++;
  report.walls.push({style,horizontalPairs:144,sameMaterialPairs:matches});
}
assert.ok(report.walls[3].sameMaterialPairs>report.walls[1].sameMaterialPairs);
values.clear();
await run("sample",{sample:"gate"});
values.set("1,0,0","waxed_copper_block");
for(let revision=1;revision<=3;revision++) {
  const r=await run("sample",{sample:"gate",revision,previous:{revision:revision-1}});
  assert.equal(get(1,0,0),"waxed_copper_block");
  assert.equal(r.protectedCount,1);
  (report.gateRevisions??=[]).push(r);
}
values.clear(); terrain=true;
report.road=await run("road",{});
assert.equal(report.road.grades.length,25);
assert.equal(report.road.gaps.length,0);
assert.equal(report.road.grades.at(-1),2);
await writeFile(new URL("offline-results.json",import.meta.url),JSON.stringify(report,null,2)+"\n");
console.log("Passed stock QuickJS geometry, texture, road, and revision fixtures");
