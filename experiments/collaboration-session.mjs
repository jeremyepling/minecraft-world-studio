import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {mkdir, open, readFile, stat, writeFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {connect} from "./client.mjs";

const args=process.argv.slice(2);
if (args.length && !(args.length===1 && args[0]==="--restart"))
  throw Error("Usage: node experiments/collaboration-session.mjs [--restart]");
const restart=args.includes("--restart");
const world="sp:WorldStudioLab", dimension="minecraft:overworld";
const root=new URL("../",import.meta.url);
const local=new URL("local/",root);
const log=new URL("instance/logs/latest.log",local);
const marker="trial-"+randomBytes(4).toString("hex");
const memory="cedar-"+randomBytes(5).toString("hex");
const trace=new URL("collaboration-tests/"+marker+"/",local);
const run=promisify(execFile);
const phase={case:"in-game-collaboration-session",restart,marker,steps:[]};

async function readJSON(relative) {
  return JSON.parse(await readFile(new URL(relative,local),"utf8"));
}
async function session() {
  try {return await readJSON("chat-loop/session.json");}
  catch(error) {
    if(error.code==="ENOENT") return {markers:[],selection:null};
    throw error;
  }
}
async function history() {
  const data=await readJSON("chat-loop/state.json");
  assert.ok(!data.active && !data.history.at(-1)?.partial,"Finish the active or interrupted edit first");
  return createHash("sha256").update(JSON.stringify(data.history)).digest("hex");
}
// The complete current roof plus a one-block halo. Compare block states including air.
async function roof(client) {
  const data=await client.tool("get_blocks_region",{from:{x:2,y:125,z:79},to:{x:16,y:136,z:93},
    dimension,includeAir:true,includeState:true,limit:4096});
  assert.equal(data.dimension,dimension);
  assert.equal(data.truncated,false);
  assert.equal(data.count,2700);
  assert.equal(data.blocks.length,2700);
  const cells=new Map();
  for(const b of data.blocks) {
    assert.ok(b.x>=2 && b.x<=16 && b.y>=125 && b.y<=136 && b.z>=79 && b.z<=93 && typeof b.state==="string");
    cells.set([b.x,b.y,b.z].join(","),b.state);
  }
  assert.equal(cells.size,2700);
  const ordered=[...cells].map(([point,state])=>point+"/"+state).sort();
  return createHash("sha256").update(ordered.join("\n")).digest("hex");
}
async function hud(client,body,pattern,timeoutMs=15000) {
  const cursor=(await stat(log)).size;
  const sent=await client.tool("send_chat",{message:"@studio "+body});
  assert.ok(sent.sent && !sent.asCommand,"Chat did not enter the player chat path");
  const step={input:body};
  phase.steps.push(step);
  const file=await open(log,"r");
  try {
    let offset=cursor,tail="",last="";
    const end=Date.now()+timeoutMs;
    while(Date.now()<end) {
      const size=(await file.stat()).size;
      assert.ok(size>=offset,"Game log restarted while waiting for HUD feedback");
      if(size>offset) {
        const buf=Buffer.alloc(size-offset);
        const {bytesRead}=await file.read(buf,0,buf.length,offset);
        offset+=bytesRead;
        const lines=(tail+buf.subarray(0,bytesRead).toString("utf8")).split(/\r?\n/);
        tail=lines.pop();
        for(const line of lines) {
          const at=line.indexOf("[CHAT] [AI] ");
          if(at<0) continue;
          last=line.slice(at+12).trim();
          if(/^(Applying|Applied|Undid)\b/i.test(last)) throw Error("Unexpected world edit during read-only test: "+last);
          if(pattern.test(last)) {step.reply=last;return last;}
        }
      }
      await delay(150);
    }
    throw Error("No HUD match for "+pattern+" after "+body+". Last reply: "+last);
  } finally {await file.close();}
}
async function requireIdle(client) {
  const reply=await hud(client,"status",/^(Working:|Studio ready\.)/i);
  assert.match(reply,/^Studio ready\./i,"Listener has a running request; stop this test before restart");
  await history();
}
async function restartListener(client) {
  await requireIdle(client);
  const launcher=fileURLToPath(new URL("scripts/Start-Chat.ps1",root));
  const invoke=mode=>run("pwsh",["-NoProfile","-File",launcher,mode],
    {cwd:fileURLToPath(root),windowsHide:true,timeout:35000});
  await invoke("-Stop");
  const stop=new URL("chat-loop/stop.request",local);
  const end=Date.now()+30000;
  for(;;) {
    try {await stat(stop);}
    catch(error) {if(error.code==="ENOENT") break;throw error;}
    if(Date.now()>end) throw Error("Previous listener did not consume its stop request");
    await delay(150);
  }
  const {stdout}=await invoke("-Background");
  assert.match(stdout,/Studio ready in Minecraft/i,"New listener did not reconnect to WorldStudioLab");
  await requireIdle(client);
}
async function main() {
  const client=await connect();
  let original,priorHistory,before,ownedMarker=false;
  await mkdir(trace,{recursive:true});
  try {
    const screen=await client.tool("get_screen"),self=await client.tool("get_self"),status=await client.tool("get_status");
    assert.ok(screen.inWorld && screen.lastWorldId===world && screen.screen==="none" && !screen.paused);
    assert.ok(status.integratedServer && status.playerCount===1 && !status.aiPaused);
    assert.equal(self.dimension,dimension);
    assert.equal(self.gameMode,"creative");
    await requireIdle(client);
    original=await session();
    assert.ok(!original.markers.some(m=>m.name===marker),"Fixture marker already exists");
    priorHistory=await history();
    before=await roof(client);
    const ray=await client.tool("raycast",{origin:{x:self.x,y:self.y+1.62,z:self.z},yaw:self.yaw,pitch:self.pitch,
      dimension,maxDistance:96,includeEntities:false});
    assert.equal(ray.hitType,"block","Aim at a block within 96 blocks before running the fixture");
    const {x,y,z}=ray.block,coords=[x,y,z].join(" ");
    ownedMarker=true;
    const tagged=await hud(client,"mark "+marker,/^Marked /i);
    assert.ok(tagged.includes(marker) && tagged.includes(coords),"Marker differs from independent raycast");
    assert.ok((await hud(client,"markers",/^Markers:/i)).includes(marker));
    assert.ok((await hud(client,"select "+marker,/^Selected /i)).includes(marker));
    const where=await hud(client,"where",/^Looking at /i);
    assert.ok(where.includes(coords) && where.includes(marker),"HUD is missing the ray hit or selection");
    const marked=await session(), hit=marked.markers.find(m=>m.name===marker);
    assert.deepEqual([hit?.x,hit?.y,hit?.z],[x,y,z],"Marker was not durably written");
    assert.equal(marked.selection?.from,marker);

    const phrase=new RegExp(memory,"i");
    await hud(client,"In this conversation our test code is "+memory+". Reply with the code. This is a conversation only.",phrase,150000);
    await hud(client,"What test code did I just give you? Reply with the code only.",phrase,150000);
    if(restart) {
      const thread=await readJSON("chat-loop/agent-session.json");
      assert.equal(thread.provider,"codex","Restart and resumption test requires Codex");
      assert.ok(thread.threadId,"Missing persisted Codex thread identity");
      await restartListener(client);
      const restored=await session();
      assert.deepEqual(restored.markers,marked.markers);
      assert.deepEqual(restored.selection,marked.selection);
      await hud(client,"Which test code were we using before reconnecting? Reply with the code only.",phrase,150000);
      const resumed=await readJSON("chat-loop/agent-session.json");
      assert.equal(resumed.threadId,thread.threadId,"The agent started a different thread");
      phase.sameCodexThread=true;
    }
  } catch(error) {
    phase.error=String(error);
    throw error;
  } finally {
    try {
      if(ownedMarker && (await session()).markers.some(m=>m.name===marker)) {
        await requireIdle(client);
        const old=original.selection;
        const name=old ? [old.from,old.to].filter(Boolean).join(" to ") : "clear";
        await hud(client,"select "+name,old?/^Selected /i:/^Selection cleared\./i);
        assert.ok((await hud(client,"forget marker "+marker,/^Forgot marker /i)).includes(marker));
      }
      if(original) {
        const final=await session();
        assert.deepEqual(final.selection??null,original.selection??null);
        assert.deepEqual(final.markers,original.markers);
      }
      if(priorHistory) assert.deepEqual(await history(),priorHistory);
      if(before) {assert.equal(await roof(client),before);phase.unchangedRoofCells=2700;}
    } catch(error) {
      phase.cleanupError=String(error);
      if(!phase.error) throw error;
    } finally {
      await client.close();
      phase.passed=!phase.error && !phase.cleanupError;
      const receipt=new URL("fixture-result.json",trace);
      await writeFile(receipt,JSON.stringify(phase,null,2)+"\n");
      console.log(phase.passed?"pass":"fail",fileURLToPath(receipt));
    }
  }
}

await main();
