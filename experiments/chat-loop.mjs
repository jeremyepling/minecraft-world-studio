import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir, open, readFile, stat, writeFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";
import {connect} from "./client.mjs";

// Use the running World Studio listener and its saved tower finish and undo history.
const world="sp:WorldStudioLab", dimension="minecraft:overworld";
const local=new URL("../local/",import.meta.url);
const log=new URL("instance/logs/latest.log",local);
const stateFile=new URL("chat-loop/state.json",local);
const state=async()=>JSON.parse(await readFile(stateFile,"utf8"));
const historyIds=s=>s.history.map(entry=>entry.id);
const bounds={from:{x:0,y:95,z:77},to:{x:18,y:145,z:95}};
const air="minecraft:air", copper="minecraft:waxed_weathered_cut_copper";
const slate=["polished_blackstone","deepslate_tiles","deepslate_bricks","polished_deepslate","polished_andesite"].map(b=>"minecraft:"+b);
const key=(x,y,z)=>[x,y,z].join(",");

async function snapshot(client) {
  const blocks=new Map();
  for(let y=bounds.from.y;y<=bounds.to.y;y+=8) {
    const from={...bounds.from,y}, to={...bounds.to,y:Math.min(y+7,bounds.to.y)};
    const data=await client.tool("get_blocks_region",{from,to,dimension,includeAir:true,includeState:true});
    assert.equal(data.dimension,dimension);
    assert.equal(data.truncated,false);
    assert.equal(data.count,19*19*(to.y-y+1),"Every block in the tower survey must be loaded");
    for(const b of data.blocks) blocks.set(key(b.x,b.y,b.z),b.state);
  }
  assert.equal(blocks.size,18411);
  return blocks;
}

function matches(actual,expected,phase) {
  for(const [pos,value] of expected) assert.equal(actual.get(pos),value,phase+" at "+pos);
}

// Independent silhouette for the lab's radius-7 watchtower, tapered to 5 below the eaves.
function roof(height,x,y,z) {
  const level=y-126;
  if(level<0 || level>=height) return false;
  const radius=6*(1-level/height), distance=Math.hypot(x-9,z-86);
  return distance<=radius && distance>=radius-1.6;
}

function checkRaisedRoof(before,after,palette) {
  let changed=0;
  for(const [pos,oldBlock] of before) {
    const [x,y,z]=pos.split(",").map(Number);
    const now=after.get(pos);
    if(roof(11,x,y,z)) assert.ok(palette.includes(now),"Expected roof material at "+pos+", got "+now);
    else if(roof(10,x,y,z)) assert.equal(now,air,"Obsolete roof voxel at "+pos);
    else assert.equal(now,oldBlock,"Unexpected change outside the roof at "+pos);
    if(now!==oldBlock) changed++;
  }
  assert.ok(changed>0);
  assert.equal(after.get(key(9,136,86)),palette.at(-1),"The crown must rise by one block and keep its finish");
  return changed;
}

// Read only new HUD messages after the initiating player input.
async function sendAndRead(client,report,message,pattern) {
  const start=(await stat(log)).size;
  const sent=await client.tool("send_chat",{message});
  assert.ok(sent.sent && !sent.asCommand);
  report.inputs.push(message);
  const file=await open(log,"r");
  try {
    let offset=start, tail="", last="";
    const deadline=Date.now()+240000;
    while(Date.now()<deadline) {
      const size=(await file.stat()).size;
      assert.ok(size>=offset,"Minecraft restarted during the test");
      if(size>offset) {
        const bytes=Buffer.alloc(size-offset);
        const {bytesRead}=await file.read(bytes,0,bytes.length,offset);
        offset+=bytesRead;
        const lines=(tail+bytes.subarray(0,bytesRead).toString("utf8")).split(/\r?\n/);
        tail=lines.pop();
        for(const line of lines) {
          const marker="[CHAT] [AI] ", at=line.indexOf(marker);
          if(at<0) continue;
          last=line.slice(at+marker.length).trim();
          report.replies.push(last);
          const match=last.match(pattern);
          if(match) return match;
          if(/^(Applied|Proposal)\b/i.test(last)) throw Error("Unexpected HUD response: "+last);
        }
      }
      await delay(200);
    }
    throw Error("Timed out waiting for "+pattern+". Last studio reply: "+last);
  } finally {await file.close();}
}

async function main() {
  const trace=new URL("chat-loop-test-direct-"+randomUUID()+"/",local);
  const report={case:"hillside-roof-direct-preview-undo",world,bounds,phase:"setup",inputs:[],replies:[]};
  const client=await connect();
  try {
    const screen=await client.tool("get_screen"), self=await client.tool("get_self"), status=await client.tool("get_status");
    assert.ok(screen.inWorld && screen.screen==="none" && screen.lastWorldId===world);
    assert.ok(status.integratedServer && status.playerCount===1 && !status.aiPaused);
    assert.equal(self.dimension,dimension);
    assert.equal(self.gameMode,"creative");

    const baseline=await state(), prior=historyIds(baseline);
    assert.ok(!baseline.active && !baseline.history.at(-1)?.partial,"Finish the active or partial edit before testing");
    const before=await snapshot(client);
    const palette=before.get(key(9,135,86))===copper?[copper]:slate;
    assert.equal(before.get(key(9,135,86)),palette.at(-1));
    assert.equal(before.get(key(9,136,86)),air);
    const request="Make the roof of the existing hillside watchtower one block taller, from 10 to 11. Keep its current finish and all other dimensions.";
    report.phase="preview";
    await sendAndRead(client,report,"@studio preview "+request,/^Preview\b/i);
    matches(await snapshot(client),before,"Preview wrote blocks");
    assert.deepEqual(historyIds(await state()),prior,"Preview added undo history");

    report.phase="direct-edit";
    const match=await sendAndRead(client,report,"@studio "+request,/^Applied\s+([a-f\d]+)\b/i);
    const editId=match[1];
    report.editId=editId;
    const applied=await state();
    assert.deepEqual(historyIds(applied),[...prior,editId],"Direct edit must add exactly one journal entry");
    try {
      const after=await snapshot(client);
      const changed=checkRaisedRoof(before,after,palette);
      const entry=applied.history.at(-1);
      assert.equal(entry.key,"hillside");
      assert.equal(entry.partial,false);
      assert.equal(entry.plan.next.roof,11);
      assert.equal(entry.applied.reduce((sum,r)=>sum+r.top-r.y+1,0),changed);
      report.changed=changed;
    } finally {
      assert.deepEqual(historyIds(await state()),[...prior,editId],"A different revision is now current; refusing to undo it");
      report.phase="undo";
      await sendAndRead(client,report,"@studio undo",new RegExp("^Undid "+editId+"\\b","i"));
      matches(await snapshot(client),before,"Undo restoration");
      assert.deepEqual((await state()).history,baseline.history,"Undo must restore the complete preceding history");
    }
    report.phase="pass";
  } catch(error) {
    report.error=String(error);
    throw error;
  } finally {
    await client.close();
    await mkdir(trace,{recursive:true});
    const target=new URL("fixture-result.json",trace);
    await writeFile(target,JSON.stringify(report,null,2)+"\n");
    console.log(report.phase,fileURLToPath(target));
  }
}

await main();
