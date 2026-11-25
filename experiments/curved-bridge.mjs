import assert from "node:assert/strict";
import {readFile,unlink,writeFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {openFixture,command,snapshot,expected,compare,logReply,receipt,worldKey,shape,air} from "./bridge-fixture.mjs";

const {client,local,directory,self}=await openFixture("curved-bridge");
const report={case:"curved-bridge-chat",phase:"setup",requests:[],observations:[]};
const state=async()=>JSON.parse(await readFile(join(local,"chat-loop/state.json"),"utf8"));
const session=async()=>JSON.parse(await readFile(join(local,"chat-loop/session.json"),"utf8"));
const landing="minecraft:emerald_block", lantern="minecraft:sea_lantern";
const west="Trial West Bank",east="Trial East Bank";
let camera=false,support=false;
async function chat(input,pattern) {
  const start=performance.now();
  const message="@studio "+input;
  report.requests.push(message);
  const reply=await logReply(local,async()=>{
    const r=await client.tool("send_chat",{message});assert.ok(r.sent && !r.asCommand);
  },line=>{
    if(!line.startsWith("[AI] "))return false;
    const body=line.slice(5);
    if(pattern.test(body))return true;
    if(/^(Working|Thinking|Applying|Undoing|Studio ready|Planning|Previewing|Surveying|Exporting)\b/i.test(body))return false;
    throw Error("Unexpected reply to "+message+": "+body);
  });
  report.observations.push({phase:report.phase,reply,wallMs:Math.round(performance.now()-start)});
  return reply;
}
const changed=(left,right)=>[...right].filter(([k,v])=>left.get(k)!==v).length;
const applied=/^Applied [a-f0-9]+: (\d+) cells changed, (\d+) verified/;
const undone=/^Undid [a-f0-9]+: (\d+) cells changed, (\d+) verified/;
function verifyCounts(reply,pattern,count) {
  const m=reply.slice(5).match(pattern);
  assert.equal(Number(m[1]),count);assert.equal(Number(m[2]),count);
}
async function photo(name) {
  await command(client,"tp WorldStudio 3.5 219 66.5 facing 17.5 212.5 88.5");
  await delay(600);
  const frame=await client.tool("screenshot");assert.ok(Buffer.isBuffer(frame)&&frame.length>1000);
  await writeFile(join(directory,name),frame);
}
try {
  const original=await state(), previous=await session();
  assert.equal(previous.provider,"codex");assert.equal(previous.selection,null);
  assert.ok(!original.active && !original.history.at(-1)?.partial);
  assert.ok(!previous.markers.some(m=>[west,east].includes(m.name)));
  const blank=await snapshot(client);
  assert.ok([...blank.values()].every(b=>b===air),"Use a clean, loaded sky plot.");
  await command(client,"setblock 3 218 66 minecraft:glass keep");
  support=true;
  await command(client,"tp WorldStudio 3.5 219 66.5 facing 17.5 212.5 88.5");camera=true;
  await command(client,"setblock 9 210 86 "+landing+" keep");
  await command(client,"setblock 25 210 86 "+landing+" keep");
  await chat("menu mark 9 210 86 "+west,/^Marked /);
  await chat("menu mark 25 210 86 "+east,/^Marked /);
  const marked=await session();
  for(const [name,x] of [[west,9],[east,25]]) {
    const point=marked.markers.find(m=>m.name===name);
    assert.deepEqual([point.x,point.y,point.z],[x,210,86]);
  }
  const base=await snapshot(client);
  const build="Build a curved stone bridge from Trial West Bank to Trial East Bank. Make its deck 3 blocks wide, its arch rise 2 blocks, and its signed bend +3 blocks.";
  report.phase="preview";
  await chat("preview "+build,/^Bridge preview/i);
  compare(await snapshot(client),base,"read-only preview");assert.deepEqual((await state()).history,original.history);
  report.phase="build";
  const built=await chat(build,applied);
  const raw=await snapshot(client), first=expected(base,shape);
  compare(raw,first,"initial bridge");verifyCounts(built,applied,changed(base,raw));
  // Both markers lead to walkable blocks at bank height. The deck curves south
  // (+Z) and rises 2 blocks at the midpoint while the centre span remains open below it.
  for(const x of [0,16])assert.notEqual(raw.get(worldKey(x,0,0)),air);
  assert.notEqual(raw.get(worldKey(8,2,3)),air);assert.equal(raw.get(worldKey(8,-1,3)),air);
  assert.equal(raw.get(worldKey(8,2,-3)),air);
  report.phase="export";
  const exported=await chat("export schematic",/^Exported the generated bridge design\./);
  const filename=exported.match(/\/\/schem load (studio_bridge_[a-f0-9]{10}\.schem)\b/)?.[1];
  assert.ok(filename,"Studio should return the generated bridge file name");
  const file=join(local,"instance/config/worldedit/schematics",filename);
  try {
    const bytes=await readFile(file);
    assert.ok(gunzipSync(bytes).includes(Buffer.from("minecraft:stone_bricks")));
    await logReply(local,()=>client.tool("send_chat",{message:"//schem load "+filename}),line=>line.includes(filename)&&/loaded/i.test(line),15000);
    report.exportedSchematic={bytes:bytes.length,loadedByWorldEdit:true};
  } finally {await unlink(file);}
  compare(await snapshot(client),first,"export and load preserve the world");
  // Choose an actual old edge cell that widening wants to repaint, ensuring
  // this manual override lies in the proposed delta.
  const wider={...shape,width:5}, wantWide=expected(base,wider);
  const conflict=[...raw].find(([k,id])=>id!==air && wantWide.get(k)!==id && base.get(k)===air);
  assert.ok(conflict,"Widening should touch at least one existing block");
  const [point,old]=conflict, coords=point.replaceAll(","," ");
  await command(client,"execute if block "+coords+" "+old+" run setblock "+coords+" "+lantern);
  first.set(point,lantern);wantWide.set(point,lantern);
  await photo("bridge-03-wide.png");
  report.phase="widen";
  const widenReply=await chat("Widen that same bridge from 3 to 5 blocks. Keep the arch height, bend and bank markers exactly as before.",applied);
  const wide=await snapshot(client);compare(wide,wantWide,"widen with manual override");
  verifyCounts(widenReply,applied,changed(first,wide));
  await photo("bridge-05-wide.png");
  report.phase="raise-arch";
  const higher={...wider,arch:4}, wantHigher=expected(base,higher);wantHigher.set(point,lantern);
  const raiseReply=await chat("Raise the arch of that same bridge by 2 blocks. Keep the width and bend unchanged.",applied);
  const raised=await snapshot(client);compare(raised,wantHigher,"four-block arch");
  verifyCounts(raiseReply,applied,changed(wide,raised));
  assert.notEqual(raised.get(worldKey(8,4,3)),air);
  await photo("bridge-05-wide-raised.png");
  report.phase="undo";
  await chat("undo",undone);compare(await snapshot(client),wide,"undo arch");
  await chat("undo",undone);compare(await snapshot(client),first,"undo width");
  await command(client,"execute if block "+coords+" "+lantern+" run setblock "+coords+" "+old);
  await chat("undo",undone);compare(await snapshot(client),base,"undo bridge");
  assert.deepEqual((await state()).history,original.history);
  assert.deepEqual((await state()).bridges??{},original.bridges??{});
  for(const [name,x] of [[west,9],[east,25]]) {
    await chat("forget marker "+name,/^Forgot marker /);
    await command(client,"execute if block "+x+" 210 86 "+landing+" run setblock "+x+" 210 86 air");
  }
  compare(await snapshot(client),blank,"restored plot");
  assert.deepEqual((await session()).markers,previous.markers);
  report.summary={surveyedCells:blank.size,freshCells:changed(base,raw),widthChanges:changed(first,wide),archChanges:changed(wide,raised),
    manualOverride:point,previewReadOnly:true,restoredWorld:true,restoredMarkers:true,restoredHistory:true};
  report.phase="pass";
} catch(error) {
  report.error=String(error);throw error;
} finally {
  try {
    if(camera)await command(client,"tp WorldStudio "+[self.x,self.y,self.z,self.yaw,self.pitch].join(" "));
    if(support)await command(client,"execute if block 3 218 66 minecraft:glass run setblock 3 218 66 air");
  } finally {await client.close();await receipt(directory,report);}
}
