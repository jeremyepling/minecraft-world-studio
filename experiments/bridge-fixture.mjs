import assert from "node:assert/strict";
import {mkdir, open, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {parseArgs} from "node:util";
import {setTimeout as delay} from "node:timers/promises";
import {randomUUID} from "node:crypto";
import {bridgeCells} from "../packages/geometry/bridge.ts";

export const origin={x:9,y:211,z:86}, air="minecraft:air";
export const shape={dx:16,dy:0,dz:0,width:3,arch:2,bend:3};
export const key=(x,y,z)=>[x,y,z].join(",");
const from={x:4,y:205,z:78}, to={x:30,y:222,z:96};
export const worldKey=(x,y,z)=>key(origin.x+x,origin.y+y,origin.z+z);

export async function openFixture(name) {
  const {values}=parseArgs({options:{"lab-root":{type:"string"}}});
  assert.ok(values["lab-root"],"Supply --lab-root PATH to a separate disposable installed lab.");
  const root=resolve(values["lab-root"]), local=join(root,"local");
  const cfg=JSON.parse((await readFile(join(local,"instance/config/mcpfabric.config.json"),"utf8")).replace(/^\uFEFF/,""));
  assert.ok(cfg.host==="127.0.0.1" && cfg.requireAuth && Number.isInteger(cfg.port) && cfg.port!==25639,"Expected copied authenticated loopback instance on a distinct port.");
  const {connect}=await import(pathToFileURL(join(root,"experiments/client.mjs")));
  const client=await connect();
  try {
    const screen=await client.tool("get_screen"), self=await client.tool("get_self"), status=await client.tool("get_status");
    assert.ok(screen.inWorld && screen.screen==="none" && !screen.paused && screen.lastWorldId==="sp:WorldStudioLab");
    assert.ok(status.integratedServer && status.playerCount===1 && !status.aiPaused);
    assert.equal(self.dimension,"minecraft:overworld");
    assert.equal(self.gameMode,"creative");
    const directory=join(local,"collaboration-tests",name+"-"+randomUUID().slice(0,8));
    await mkdir(directory,{recursive:true});
    return {client,local,directory,self};
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function command(client,cmd) {
  const r=await client.tool("run_command",{command:cmd});
  assert.ok(r.success,cmd+" failed: "+JSON.stringify(r.output));
  return r;
}

export async function snapshot(client) {
  const blocks=new Map();
  for (let y=from.y;y<=to.y;y+=3) {
    const top=Math.min(to.y,y+2);
    const slab=await client.tool("get_blocks_region",{dimension:"minecraft:overworld",from:{...from,y},to:{...to,y:top},includeAir:true,includeState:true});
    const volume=(to.x-from.x+1)*(to.z-from.z+1)*(top-y+1);
    assert.ok(!slab.truncated && slab.volume===volume && slab.blocks.length===volume && slab.dimension==="minecraft:overworld");
    for (const p of slab.blocks) blocks.set(key(p.x,p.y,p.z),p.state);
  }
  assert.equal(blocks.size,9234);
  return blocks;
}

// Compare the complete loaded volume (including air and margins), plus the
// independent landing, crown and curvature checks in the chat case.
export function expected(base,params,generate=bridgeCells,pivot=origin) {
  const result=new Map(base);
  for(const cell of generate(params)) {
    const k=key(pivot.x+cell.x,pivot.y+cell.y,pivot.z+cell.z);
    assert.ok(result.has(k),"Geometry outside the test plot at "+k);
    if(base.get(k)===air)result.set(k,"minecraft:"+cell.material);
  }
  return result;
}
export function compare(actual,want,step) {
  assert.equal(actual.size,want.size);
  for(const [k,id] of want)assert.equal(actual.get(k),id,step+" at "+k);
}

export async function logReply(local,send,accept,timeout=240000) {
  const file=await open(join(local,"instance/logs/latest.log"),"r");
  try {
    let pos=(await file.stat()).size, tail="", last="";
    const start=Date.now();
    await send();
    while (Date.now()-start<timeout) {
      const length=(await file.stat()).size;
      assert.ok(length>=pos,"Client log rotated during test.");
      if(length>pos) {
        const buffer=Buffer.alloc(length-pos);
        const {bytesRead}=await file.read(buffer,0,buffer.length,pos);
        pos+=bytesRead;
        const lines=(tail+buffer.toString("utf8",0,bytesRead)).split(/\r?\n/);
        tail=lines.pop();
        for(const line of lines) {
          if(!line.includes("[CHAT] "))continue;
          last=line.split("[CHAT] ").at(-1).trim();
          if(accept(last))return last;
        }
      }
      await delay(60);
    }
    throw Error("Timed out waiting for Minecraft feedback. Last chat line: "+last);
  } finally {await file.close();}
}

export async function receipt(directory,report) {
  const path=join(directory,"fixture-result.json");
  await writeFile(path,JSON.stringify(report,null,2)+"\n");
  console.log(report.phase,path);
}
