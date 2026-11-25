import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir, open, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {pathToFileURL} from "node:url";
import {parseArgs} from "node:util";

// Drive the installed listener in a separate lab copy with its own port and state.
const {values}=parseArgs({options:{"lab-root":{type:"string"}}});
assert.ok(values["lab-root"],"Supply --lab-root PATH to a disposable Studio copy with a running listener.");
const root=resolve(values["lab-root"]), local=join(root,"local");
const config=JSON.parse((await readFile(join(local,"instance/config/mcpfabric.config.json"),"utf8")).replace(/^\uFEFF/,""));
assert.ok(config.host==="127.0.0.1" && config.requireAuth && Number.isInteger(config.port) && config.port!==25639,
  "Use a separate authenticated loopback lab on its own port.");
const {connect}=await import(pathToFileURL(join(root,"experiments/client.mjs")));
const client=await connect();
const world="sp:WorldStudioLab", dimension="minecraft:overworld";
const origin={x:9,y:211,z:86}, towerKey="tower-9_211_86", height=12;
const air="minecraft:air", copper="minecraft:waxed_weathered_cut_copper", lamp="minecraft:sea_lantern";
const key=(x,y,z)=>[x,y,z].join(",");
const oldPeak=key(0,height+5,0);
const state=async()=>JSON.parse(await readFile(join(local,"chat-loop/state.json"),"utf8"));
const ids=s=>s.history.map(entry=>entry.id);
const dir=join(local,"collaboration-tests","parametric-tower-"+randomUUID().slice(0,8));
const report={case:"parametric-tower-revisions",world,dimension,origin,phase:"setup",inputs:[],observations:[]};

async function snapshot() {
  const result=new Map();
  // Read the complete test volume and one-block air margins, not just the write receipt.
  for (let dy=-1;dy<=22;dy+=6) {
    const top=Math.min(22,dy+5);
    const from={x:origin.x-7,y:origin.y+dy,z:origin.z-7},to={x:origin.x+7,y:origin.y+top,z:origin.z+7};
    const slab=await client.tool("get_blocks_region",{from,to,dimension,includeAir:true,includeState:true});
    assert.equal(slab.dimension,dimension);
    assert.equal(slab.truncated,false);
    assert.equal(slab.count,225*(top-dy+1),"Load the test volume before running the case.");
    for (const b of slab.blocks) result.set(key(b.x-origin.x,b.y-origin.y,b.z-origin.z),b.state);
  }
  assert.equal(result.size,5400);
  return result;
}

// Independent oracle for this one known tower, in tower-local coordinates.
function expectedAt(x,y,z,roof,entrance,manual) {
  if (x===0 && y===-1 && z===0) return "minecraft:stone";
  if (manual && key(x,y,z)===oldPeak) return lamp;
  const radius=Math.hypot(x,z);
  if (y>=height && y<height+roof) {
    const outer=5*(1-(y-height)/roof);
    return radius<=outer && radius>=outer-1.6 ? copper : air;
  }
  if (y<0 || y>=height) return air;
  const outer=5-y/(height-1);
  if (radius>outer || radius<outer-1) return air;
  if ((entrance==="north" ? z<0 : z>0) && Math.abs(x)<=1 && y<(x===0?5:4)) return air;
  if (y>=10 && (x===0 || z===0)) return air;
  return y<3 ? "minecraft:andesite" : "minecraft:stone_bricks";
}

function checkShape(blocks,roof,entrance,manual) {
  for (const [pos,state] of blocks) {
    const [x,y,z]=pos.split(",").map(Number);
    assert.equal(state,expectedAt(x,y,z,roof,entrance,manual),report.phase+" at relative "+pos);
  }
}
function changes(previous,current) {
  return [...current].filter(([pos,block])=>previous.get(pos)!==block).map(([pos])=>pos);
}
async function command(command) {
  const response=await client.tool("run_command",{command});
  assert.ok(response.success,command+" failed: "+JSON.stringify(response.output));
}
async function revision(input, direction, prior, undoId) {
  const file=await open(join(local,"instance/logs/latest.log"),"r");
  try {
    let offset=(await file.stat()).size, tail="", last="";
    const started=Date.now();
    const sent=await client.tool("send_chat",{message:input});
    assert.ok(sent.sent && !sent.asCommand);
    report.inputs.push(input);
    while (Date.now()-started<240000) {
      const size=(await file.stat()).size;
      assert.ok(size>=offset,"The client restarted mid-revision.");
      if (size>offset) {
        const buf=Buffer.alloc(size-offset);
        const {bytesRead}=await file.read(buf,0,buf.length,offset);
        offset+=bytesRead;
        const lines=(tail+buf.toString("utf8",0,bytesRead)).split(/\r?\n/);
        tail=lines.pop();
        for (const line of lines) {
          if (!line.includes("[CHAT] [AI] ")) continue;
          last=line.split("[CHAT] [AI] ").at(-1).trim();
          const receipt=last.match(/^(Applied|Undid) ([a-f0-9]+): (\d+) cells changed, (\d+) verified/);
          if (!receipt) {
            if (/^(Working|Thinking|Applying|Undoing|Studio ready)\b/.test(last)) continue;
            throw Error("Expected "+direction+" after "+input+"; Studio replied "+last);
          }
          const [,verb,id,written,verified]=receipt;
          assert.equal(verb,direction);
          if (undoId) assert.equal(id,undoId);
          const after=await state();
          assert.deepEqual(ids(after),undoId?prior.slice(0,-1):[...prior,id]);
          assert.equal(written,verified);
          report.observations.push({phase:report.phase,reply:last,elapsedMs:Date.now()-started});
          return {id,count:Number(written),state:after};
        }
      }
      await delay(180);
    }
    throw Error("Timed out waiting for "+direction+". Last Studio reply: "+last);
  } finally {await file.close();}
}

let camera;
try {
  const screen=await client.tool("get_screen"), self=await client.tool("get_self"), status=await client.tool("get_status");
  assert.ok(screen.inWorld && screen.screen==="none" && screen.lastWorldId===world);
  assert.ok(status.integratedServer && status.playerCount===1 && !status.aiPaused);
  assert.equal(self.dimension,dimension);
  assert.equal(self.gameMode,"creative");
  const baseline=await state();
  const session=JSON.parse(await readFile(join(local,"chat-loop/session.json"),"utf8"));
  assert.equal(session.selection,null,"Clear the copied lab's Studio selection before running.");
  assert.ok(!baseline.active && !baseline.history.at(-1)?.partial && !baseline.towers[towerKey]);
  const empty=await snapshot();
  assert.ok([...empty.values()].every(s=>s===air),"The fixture needs an empty sky plot.");
  camera=self;
  await command("setblock 9 210 86 minecraft:stone keep");
  await command("tp WorldStudio 9.5 211 86.5 0 90");
  report.phase="create";
  const created=await revision("@studio Build a new copper-roof watchtower here with 12-block walls, radius 5, taper 1, wall thickness 1, a 6-block roof and a north entrance.","Applied",ids(baseline));
  assert.deepEqual(created.state.towers[towerKey].origin,origin);
  const raw=await snapshot();
  checkShape(raw,6,"north",false);
  await command("setblock 9 228 86 minecraft:sea_lantern");
  const before=await snapshot();
  checkShape(before,6,"north",true);
  report.phase="raise-roof";
  const raised=await revision("@studio Make the roof of the tower we just built four blocks taller. Leave the walls and doorway exactly as they are.","Applied",ids(created.state));
  const taller=await snapshot();
  checkShape(taller,10,"north",true);
  const roofDelta=changes(before,taller);
  assert.equal(roofDelta.length,raised.count);
  assert.ok(roofDelta.length && roofDelta.every(p=>Number(p.split(",")[1])>=height));

  report.phase="move-door";
  const moved=await revision("@studio Move the entrance of that same tower to the south side and close its north entrance. Keep the roof and other dimensions as they are.","Applied",ids(raised.state));
  const south=await snapshot();
  checkShape(south,10,"south",true);
  const doorDelta=changes(taller,south);
  assert.ok(doorDelta.length && doorDelta.every(p=>Number(p.split(",")[1])<5));
  assert.equal(doorDelta.length,moved.count);
  assert.equal(south.get(key(0,0,-5)),"minecraft:andesite");
  assert.equal(south.get(key(0,0,5)),air);

  report.phase="undo-door";
  await revision("@studio undo","Undid",ids(moved.state),moved.id);
  assert.deepEqual(await snapshot(),taller);
  report.phase="undo-roof";
  await revision("@studio undo","Undid",ids(raised.state),raised.id);
  assert.deepEqual(await snapshot(),before);
  // Remove only the fixture's manual override before undoing creation.
  await command("execute if block 9 228 86 minecraft:sea_lantern run setblock 9 228 86 minecraft:waxed_weathered_cut_copper");
  report.phase="undo-create";
  const restored=await revision("@studio undo","Undid",ids(created.state),created.id);
  assert.deepEqual(restored.state.history,baseline.history);
  assert.ok(!restored.state.towers[towerKey]);
  await command("execute if block 9 210 86 minecraft:stone run setblock 9 210 86 minecraft:air");
  assert.deepEqual(await snapshot(),empty);
  report.summary={surveyedCells:empty.size,roofChanges:roofDelta.length,doorChanges:doorDelta.length,
    manualOverride:oldPeak,restoredWorld:true,restoredHistory:true};
  report.phase="pass";
} catch (error) {
  report.error=String(error);
  throw error;
} finally {
  try {
    if (camera) await command("tp WorldStudio "+[camera.x,camera.y,camera.z,camera.yaw,camera.pitch].join(" "));
  } finally {
    await client.close();
    await mkdir(dir,{recursive:true});
    const output=join(dir,"fixture-result.json");
    await writeFile(output,JSON.stringify(report,null,2)+"\n");
    console.log(report.phase,output);
  }
}
