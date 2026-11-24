import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir, open, stat, writeFile} from "node:fs/promises";
import {createInterface} from "node:readline";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";

import {connect} from "./client.mjs";

// This case targets the original 30-block hillside tower in the isolated lab.
const origin = {x:9, y:96, z:86};
const world = "sp:WorldStudioLab";
const dimension = "minecraft:overworld";
const air = "minecraft:air";
const copper = "minecraft:waxed_weathered_cut_copper";
const region = {
  from:{x:1, y:124, z:78}, to:{x:17, y:139, z:94},
  includeAir:true, includeState:true, dimension
};
const markerBeforeApproval = {x:9, y:137, z:86, id:"minecraft:diamond_block"};
const markerBeforeUndo = {x:9, y:136, z:86, id:"minecraft:lapis_block"};
const key = ({x,y,z}) => [x,y,z].join(",");
const keyAt = (map, point) => map[key(point)];
const setAt = (map, point, value) => { map[key(point)] = value; };
const local = new URL("../local/",import.meta.url);
const log = new URL("instance/logs/latest.log",local);

async function snapshot(client) {
  const scan = await client.tool("get_blocks_region",region);
  assert.equal(scan.dimension, dimension);
  assert.equal(scan.volume,17*16*17);
  assert.equal(scan.count,scan.volume,"The whole watchtower roof must be loaded");
  assert.equal(scan.truncated,false);
  const result = {};
  for (const block of scan.blocks) result[key(block)] = block.state;
  assert.equal(Object.keys(result).length,scan.volume);
  return result;
}

// Independent expected silhouette for this specific base radius and taper.
function roofCell(height, x, y, z) {
  const level = y - (origin.y + 30);
  if (level < 0 || level >= height) return false;
  // Evaluate the same linear interpolation convention as the original
  // watchtower. Rounding at a one-block radius changes its four neighbors.
  const radius = 6 * (1-level/height);
  const distance = Math.hypot(x-origin.x,z-origin.z);
  return distance <= radius && distance >= radius-1.6;
}

function expectedRoof(before) {
  const next = {...before};
  let changed = 0;
  for (let y=126;y<=137;y++) {
    for (let z=region.from.z;z<=region.to.z;z++) {
      for (let x=region.from.x;x<=region.to.x;x++) {
        const point = {x,y,z};
        const oldRoof = roofCell(10,x,y,z);
        const newRoof = roofCell(12,x,y,z);
        if (oldRoof === newRoof) continue;
        assert.equal(keyAt(before,point),oldRoof ? copper : air,
          "Expected the original 10-block roof at " + key(point));
        setAt(next,point,newRoof ? copper : air);
        changed++;
      }
    }
  }
  assert.equal(keyAt(before,markerBeforeApproval),air);
  assert.equal(keyAt(before,markerBeforeUndo),air);
  assert.equal(keyAt(next,markerBeforeApproval),copper);
  assert.equal(keyAt(next,markerBeforeUndo),copper);
  return {next,changed};
}

function checkSnapshot(observed,expected,phase) {
  // Report coordinate/state mismatches without flooding diagnostics with the entire region.
  const mismatches = Object.keys(expected).filter(k=>observed[k]!==expected[k]);
  if (mismatches.length) {
    const examples=mismatches.slice(0,4).map(k=>k+" expected "+expected[k]+" got "+observed[k]);
    throw Error(phase+": "+mismatches.length+" differing cells. "+examples.join(" / "));
  }
}

async function replace(client,point,from,to) {
  // The marker block types in this fixture have no properties or block entity.
  const coords = [point.x,point.y,point.z].join(" ");
  const command = "execute in "+dimension+" if block "+coords+" "+from+" run setblock "+coords+" "+to;
  const r = await client.tool("run_command",{command});
  assert.ok(r.success && r.resultValue===1, "Marker precondition failed at "+coords+": "+JSON.stringify(r));
}

// show_message is rendered as [AI] in the game log. Only accept new HUD lines
// written after the triggering player input, never earlier runs' confirmations.
async function waitReply(start, pattern, child, timeoutMs) {
  const end = Date.now()+timeoutMs;
  const f = await open(log,"r");
  try {
    let previous = "";
    while (Date.now()<end) {
      if (child.exitCode!==null || child.signalCode) throw Error("Listener stopped while waiting for "+pattern);
      const size = (await f.stat()).size;
      if (size<start) throw Error("Minecraft restarted during the scenario");
      if (size>start) {
        const buffer=Buffer.alloc(size-start);
        const {bytesRead}=await f.read(buffer,0,buffer.length,start);
        const lines=buffer.subarray(0,bytesRead).toString("utf8").split(/\r?\n/);
        for (const line of lines) {
          const i=line.indexOf("[CHAT] [AI] ");
          if (i===-1) continue;
          const visible=line.slice(i+12).trim();
          previous=visible;
          const match=visible.match(pattern);
          if(match) return {visible,match};
        }
      }
      await delay(200);
    }
    throw Error("Timed out waiting for "+pattern+". Last AI reply: "+previous);
  } finally { await f.close(); }
}

async function main() {
  const label="scenario-"+randomUUID();
  const traceDirectory=new URL("chat-loop-test-"+label+"/",local);
  const report={case:"hillside-roof-approval-undo",world,region,phase:"setup",replies:[]};
  const client=await connect();
  let listener;
  const cleanups=[];
  try {
    const screen=await client.tool("get_screen");
    const self=await client.tool("get_self");
    const status=await client.tool("get_status");
    assert.ok(screen.inWorld && screen.screen==="none" && screen.lastWorldId===world);
    assert.ok(status.integratedServer && status.playerCount===1 && !status.aiPaused);
    assert.equal(self.dimension,dimension);
    assert.equal(self.gameMode,"creative");
    const before=await snapshot(client);
    const {next,changed}=expectedRoof(before);
    report.expectedShapeChanges=changed;
    const command=fileURLToPath(new URL("../scripts/chat-loop.mjs",import.meta.url));
    listener=spawn(process.execPath,[command,"--test-state",label],{stdio:["ignore","pipe","inherit"],windowsHide:true});
    const readyLines=createInterface({input:listener.stdout});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("Listener did not become ready")),60000);
      const finish=(err)=>{ clearTimeout(timer); err ? reject(err) : resolve(); };
      listener.once("error",finish);
      listener.once("exit",code=>finish(Error("Listener exited with code "+code)));
      readyLines.on("line",line=>{
        console.log("[listener]",line);
        if (/Studio ready/i.test(line)) finish();
      });
    });
    async function send(message) {
      const r=await client.tool("send_chat",{message});
      assert.ok(r.sent && !r.asCommand);
    }
    async function sendAndRead(message,pattern,timeoutMs) {
      const start=(await stat(log)).size;
      await send(message);
      const reply=await waitReply(start,pattern,listener,timeoutMs);
      report.replies.push(reply.visible);
      return reply.match;
    }

    report.phase="propose";
    const proposal=await sendAndRead(
      "@studio Make the roof of the existing hillside watchtower exactly 2 blocks taller, from 10 to 12. Keep the walls and all other parameters unchanged.",
      /\bProposal\s+([a-f\d]+)\b/i,240000);
    const id=proposal[1];
    report.proposalId=id;
    checkSnapshot(await snapshot(client),before,"Proposal wrote to the world");
    report.phase="approve";
    await replace(client,markerBeforeApproval,air,markerBeforeApproval.id);
    cleanups.push(markerBeforeApproval);
    await sendAndRead("@studio approve "+id,new RegExp("\\bApplied\\s+"+id+"\\b","i"),100000);
    setAt(next,markerBeforeApproval,markerBeforeApproval.id);
    checkSnapshot(await snapshot(client),next,"Approved revision");
    report.phase="undo";
    await replace(client,markerBeforeUndo,copper,markerBeforeUndo.id);
    cleanups.push(markerBeforeUndo);
    await sendAndRead("@studio undo",new RegExp("\\bUndid\\s+"+id+"\\b","i"),100000);
    const expectedUndo={...before};
    for (const marker of cleanups) setAt(expectedUndo,marker,marker.id);
    checkSnapshot(await snapshot(client),expectedUndo,"Checked undo");
    report.phase="restore";
    while (cleanups.length) {
      const marker=cleanups.at(-1);
      await replace(client,marker,marker.id,air);
      cleanups.pop();
    }
    checkSnapshot(await snapshot(client),before,"Fixture restoration");
    report.phase="pass";
  } catch(e) {
    report.error=String(e);
    throw e;
  } finally {
    if (listener && listener.exitCode===null) listener.kill();
    // A failed revision may still need checked undo. Keep the private log and
    // leave the footprint in place for diagnosis rather than writing over it.
    report.remainingFixtureMarkers=cleanups.map(key);
    await client.close();
    await mkdir(traceDirectory,{recursive:true});
    const reportFile=new URL("fixture-result.json",traceDirectory);
    await writeFile(reportFile,JSON.stringify(report,null,2)+"\n");
    console.log(report.phase, fileURLToPath(reportFile));
  }
}

await main();
