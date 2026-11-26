import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {bridgeCells} from "../packages/geometry/bridge.ts";
import {towerCells} from "../packages/geometry/tower.ts";
import {air,command,compare,expected,key,logReply,openFixture,receipt} from "./bridge-fixture.mjs";

// node --experimental-strip-types experiments/architectural-patina.mjs --lab-root PATH
// Use the isolated installed Fabric 26.3 WorldStudioLab with its Codex listener.
const tower = {
  name:"tower", origin:{x:9,y:211,z:86}, from:{x:2,y:210,z:79}, to:{x:16,y:238,z:93},
  shape:{height:20,radius:6,taper:1,thickness:1,roof:6,entrance:"north",roofFinish:"copper"},
  generate:towerCells, camera:[16.5,224,60.5], target:[9.5,223,86.5],
  stand:"9.5 211 86.5 0 90",
  build:"Build a new copper-roof watchtower here with 20-block walls, radius 6, taper 1, wall thickness 1, a 6-block roof and a north entrance."
};
const bridge = {
  name:"bridge",origin:{x:57,y:63,z:27},from:{x:53,y:59,z:22},to:{x:79,y:72,z:34},
  shape:{dx:18,dy:0,dz:0,width:5,arch:4,bend:2},generate:bridgeCells,
  camera:[66.5,63.15,23.5],target:[66.5,63.65,28.5],
  stand:"74.5 74 38.5 facing 66.5 65.6 28.5",
  build:"Build a curved stone bridge from Patina West Bank to Patina East Bank with total width 5 blocks, arch rise 4 and signed bend +2."
};
const banks = [["Patina West Bank",57],["Patina East Bank",75]];
const applied = /^Applied ([a-f0-9]+): (\d+) cells changed, (\d+) verified; (\d+) changed/;
const undone = /^Undid ([a-f0-9]+): (\d+) cells changed, (\d+) verified; (\d+) changed/;
const {client,local,directory,self} = await openFixture("architectural-patina");
const report = {case:"architectural-patina",platform:"Fabric 26.3",world:"sp:WorldStudioLab",observations:[],images:[],objects:{}};
const json = async name=>JSON.parse(await readFile(join(local,"chat-loop",name+".json"),"utf8"));
const cmd = text=>command(client,text);
const changed = (a,b)=>[...b.keys()].filter(k=>a.get(k)!==b.get(k));
const ids = state=>state.history.map(entry=>entry.id);
const supports = [], markers = [];
let original, previous, active, hand, day, tickSpeed;

async function chat(input,pattern) {
  const message="@studio "+input, start=performance.now(), event={phase:report.phase,message};
  report.observations.push(event);
  const reply=await logReply(local,async()=>{
    const sent=await client.tool("send_chat",{message}); assert.ok(sent.sent && !sent.asCommand);
  },line=>{
    if (!line.startsWith("[AI] ")) return false;
    const body=line.slice(5);
    if (pattern.test(body)) return true;
    if (/^(Working|Thinking|Applying|Undoing|Studio ready|Planning|Previewing|Surveying|Designing)\b/i.test(body)) return false;
    throw Error("Unexpected response to "+message+": "+body);
  });
  event.reply=reply; event.wallMs=Math.round(performance.now()-start);
  return reply.slice(5).match(pattern);
}

async function survey(site) {
  const map=new Map(), {from,to}=site;
  for (let y=from.y;y<=to.y;y+=3) {
    const top=Math.min(y+2,to.y);
    const slab=await client.tool("get_blocks_region",{dimension:"minecraft:overworld",from:{...from,y},to:{...to,y:top},includeAir:true,includeState:true});
    assert.equal(slab.truncated,false);
    assert.equal(slab.blocks.length,(to.x-from.x+1)*(to.z-from.z+1)*(top-y+1));
    for (const p of slab.blocks) map.set(key(p.x,p.y,p.z),p.state);
  }
  assert.equal(map.size,(to.x-from.x+1)*(to.z-from.z+1)*(to.y-from.y+1));
  return map;
}

async function support(coords,block) {
  await cmd("setblock "+coords+" "+block+" keep");
  supports.push({coords,block});
}

async function photo(site,label) {
  await cmd("gamemode spectator WorldStudio");
  try {
    await cmd("tp WorldStudio "+site.camera.join(" ")+" facing "+site.target.join(" "));
    await client.tool("set_time",{time:6000});
    const view=await client.tool("get_self");
    for (const [i,axis] of ["x","y","z"].entries()) assert.ok(Math.abs(view[axis]-site.camera[i])<0.02);
    const previous=report.images.find(i=>i.site===site.name);
    if (previous) for (const axis of ["yaw","pitch"]) assert.ok(Math.abs(view[axis]-previous[axis])<0.02);
    await delay(12000);
    const frame=await client.tool("screenshot");
    assert.ok(Buffer.isBuffer(frame) && frame.length>1000);
    const name=site.name+"-"+label+"-"+(site===tower?"north-elevation":"upstream-soffit")+".png";
    await writeFile(join(directory,name),frame);
    const weather=await client.tool("get_time_and_weather");
    if (previous) assert.equal(weather.raining,previous.raining);
    report.images.push({name,site:site.name,camera:site.camera,target:site.target,
      yaw:view.yaw,pitch:view.pitch,raining:weather.raining,dayTime:weather.dayTime});
  } finally {
    await cmd("tp WorldStudio "+site.stand);
    await cmd("gamemode creative WorldStudio");
    await delay(1400);
  }
}

function verifyReceipt(match,before,after) {
  const count=changed(before,after).length;
  assert.equal(Number(match[2]),count,"Independent block changes vs. chat receipt");
  assert.equal(Number(match[3]),count,"Independent block changes vs. verified writes");
  assert.ok(count);
  return count;
}

function checkPatchedShadow(site,prior,shaded) {
  assert.equal(shaded.params.shadowVariation,true,"A new shadow should enable clustered tones");
  const banded=expected(site.base,{...shaded.params,shadowVariation:false},site.generate,site.origin);
  const differing=changed(banded,shaded.map);
  assert.ok(differing.length,"Expected at least one live shade that differs from the older banded finish");
  for (const point of differing) {
    assert.notEqual(banded.get(point),prior.get(point),"A clustered tone escaped the original shadow at "+point);
  }
  report.objects[site.name].cellsDifferentFromBandedShadow=differing.length;
}

async function revise(site,prompt,label,prior) {
  report.phase=site.name+" "+label;
  const match=await chat(prompt,applied);
  const state=await json("state"), entry=state.history.at(-1);
  assert.equal(entry.id,match[1]);
  if (site.objectKey) assert.equal(entry.key,site.objectKey);
  else site.objectKey=entry.key;
  const registered=(site===tower?state.towers:state.bridges)[entry.key];
  assert.deepEqual(registered.origin,site.origin);
  for (const [k,v] of Object.entries(site.shape)) assert.equal(registered.params[k],v,k);
  const live=await survey(site);
  compare(live,expected(site.base,registered.params,site.generate,site.origin),site.name+" "+label);
  const count=verifyReceipt(match,prior,live), palette={};
  for (const k of changed(prior,live)) {
    const block=live.get(k); palette[block]=(palette[block]??0)+1;
    if (label!=="build") {
      assert.equal(site.base.get(k),air,"Natural terrain changed at "+k);
      assert.notEqual(prior.get(k),air,"Geometry added at "+k);
      assert.notEqual(block,air,"Geometry removed at "+k);
    }
  }
  report.objects[site.name][label]={id:entry.id,count,palette,params:registered.params,surveyed:live.size};
  return {map:live,id:entry.id,params:registered.params};
}

async function checkUndo(site,stage,want,guarded) {
  assert.equal((await json("state")).history.at(-1).id,stage.id);
  let from=stage.map, to=want;
  if (guarded) {
    const point=changed(want,from)[0], coords=point.replaceAll(","," ");
    const manual="minecraft:cut_copper";
    await cmd("execute if block "+coords+" "+from.get(point)+" run setblock "+coords+" "+manual);
    hand={point,coords,manual,applied:from.get(point),restored:want.get(point),id:stage.id};
    from=new Map(from).set(point,manual); to=new Map(want).set(point,manual);
    compare(await survey(site),from,"Simulated hand edit before undo");
  }
  const match=await chat("undo",undone);
  assert.equal(match[1],stage.id);
  const actual=await survey(site);
  compare(actual,to,"Undo on "+site.name);
  const count=verifyReceipt(match,from,actual);
  assert.equal(Number(match[4]),guarded?1:0,"Number of hand edits preserved");
  (report.objects[site.name].undos??=[]).push({id:stage.id,count,manual:hand?.point,skipped:Number(match[4])});
  if (guarded) {
    await restoreHand();
    compare(await survey(site),want,"Restored simulated hand edit");
  }
}

async function restoreHand() {
  if (!hand) return;
  const stillApplied=ids(await json("state")).includes(hand.id);
  await cmd("execute if block "+hand.coords+" "+hand.manual+" run setblock "+hand.coords+" "+(stillApplied?hand.applied:hand.restored));
  hand=null;
}

async function runTower() {
  active=tower;
  tower.raw=await survey(tower);
  assert.ok([...tower.raw.values()].every(v=>v===air),"Load the empty sky plot");
  await support("9 210 86","minecraft:stone");
  await cmd("tp WorldStudio "+tower.stand);
  tower.base=await survey(tower);
  const built=await revise(tower,tower.build,"build",tower.base);
  assert.ok(!built.params.drips && !built.params.shadowSource);
  await photo(tower,"original");
  const dripped=await revise(tower,"Add dark rainwater drips beneath the windows of this tower. Keep the walls, roof and openings the same shape.","window-drips",built.map);
  assert.equal(dripped.params.drips,true);
  assert.ok(!dripped.params.shadowSource);
  // The first tier of north-facing windows opens at local y=10. Directly below
  // that opening, a contiguous, descending stain should reach the masonry.
  const north=[];
  for (const k of changed(built.map,dripped.map)) {
    const [x,y,z]=k.split(",").map(Number).map((n,i)=>n-[9,211,86][i]);
    if (Math.abs(x)<=1 && z<0 && y<10) north.push(y);
    assert.ok(y<tower.shape.height,"Roof finish changed");
  }
  assert.ok(new Set(north).size>=2,"Expected a north-wall drip below the sill");
  report.objects.tower.dripLayers=[...new Set(north)].sort((a,b)=>b-a);
  function northFace(map,layers) {
    return layers.map(y=>map.get(key(tower.origin.x,tower.origin.y+y,tower.origin.z-5)));
  }
  const dripMaterials=["deepslate_bricks","tuff_bricks","polished_tuff","stone_bricks"].map(id=>"minecraft:"+id);
  assert.deepEqual(northFace(dripped.map,[9,7,6,5]),dripMaterials,"North sill drip should fade back into the wall in four blocks");
  report.objects.tower.northSill={localY:[9,7,6,5],materials:dripMaterials};
  await photo(tower,"window-drips");
  report.phase="tower shadow source question";
  const history=ids(await json("state"));
  await chat("Add cast shadows to this tower",/^(?=.*light)(?=.*(your position|standing|overhead)).+/i);
  assert.deepEqual(ids(await json("state")),history);
  compare(await survey(tower),dripped.map,"Awaiting source must not paint");
  const shaded=await revise(tower,"From directly overhead","overhead-shadow",dripped.map);
  const source=shaded.params.shadowSource;
  assert.ok(source && Math.abs(source.x)<2 && Math.abs(source.z)<2 && source.y>tower.shape.height);
  assert.equal(shaded.params.drips,true);
  checkPatchedShadow(tower,dripped.map,shaded);
  assert.deepEqual(northFace(shaded.map,[19,15,13]),dripMaterials.slice(0,3),"Scaled penumbra should soften down the wall under the roof");
  report.objects.tower.northEave={localY:[19,15,13],materials:dripMaterials.slice(0,3)};
  // Follow the outside face around the tapered wall. This course used to be
  // a single band. Its darker patch should span adjacent stones before fading.
  const course=[[-3,-4],[-2,-4],[-1,-5],[0,-5],[1,-5],[2,-4],[3,-4]];
  const courseMaterials=course.map(([x,z])=>shaded.map.get(key(tower.origin.x+x,tower.origin.y+16,tower.origin.z+z)));
  const [dark,mid]=dripMaterials;
  assert.deepEqual(courseMaterials,[mid,mid,dark,dark,dark,dark,mid],"Expected a coherent dark patch in the north eave course");
  report.objects.tower.northEaveCourse={localY:16,localXZ:course,materials:courseMaterials};
  await photo(tower,"overhead-shadow");
  await checkUndo(tower,shaded,dripped.map,true);
  await checkUndo(tower,dripped,built.map,false);
  await checkUndo(tower,built,tower.base,false);
  active=null;
}

async function runBridge() {
  active=bridge;
  await cmd("tp WorldStudio 57.5 63 27.5 facing 67 65 29");
  bridge.base=await survey(bridge);
  for (const [name,x] of banks) {
    assert.match(bridge.base.get(key(x,62,27)),/^minecraft:grass_block/);
    await chat("menu mark "+x+" 62 27 "+name,/^Marked /); markers.push(name);
  }
  assert.match(bridge.base.get("66,62,27"),/^minecraft:water/);
  await support("74 73 38","minecraft:barrier");
  const built=await revise(bridge,bridge.build,"build",bridge.base);
  await photo(bridge,"original");
  const player=await client.tool("get_self");
  const shaded=await revise(bridge,"Cast a shadow on this bridge from where I am standing","player-shadow",built.map);
  const source=shaded.params.shadowSource;
  const eyes={x:player.x-bridge.origin.x,y:player.y+1.62-bridge.origin.y,z:player.z-bridge.origin.z};
  assert.ok(source);
  for (const axis of ["x","y","z"]) assert.ok(Math.abs(source[axis]-eyes[axis])<0.05,"Light source captured player's "+axis);
  report.objects.bridge.playerEyeLocal=eyes;
  checkPatchedShadow(bridge,built.map,shaded);
  const bridgeSamples={"61,64,26":"minecraft:deepslate_bricks","60,63,28":"minecraft:deepslate_bricks","69,65,27":"minecraft:tuff_bricks"};
  for (const [position,material] of Object.entries(bridgeSamples)) {
    assert.notEqual(built.map.get(position),material);
    assert.equal(shaded.map.get(position),material);
  }
  assert.equal(shaded.map.get("66,67,29"),"minecraft:stone_bricks","The crown walkway keeps its original surface");
  report.objects.bridge.upstreamSoffit=bridgeSamples;
  await photo(bridge,"player-shadow");
  await checkUndo(bridge,shaded,built.map,true);
  await checkUndo(bridge,built,bridge.base,false);
  active=null;
}

async function restore() {
  await restoreHand();
  if (original) {
    while (true) {
      const state=await json("state"), top=state.history.at(-1);
      assert.ok(!state.active);
      assert.deepEqual(ids(state).slice(0,original.history.length),ids(original));
      if (state.history.length===original.history.length) break;
      assert.ok(active,"Unexpected edit after restoring fixture");
      assert.deepEqual(top.plan.origin,active.origin);
      assert.equal(active===tower?(top.kind??"tower"):top.kind,active.name);
      const match=await chat("undo",undone); assert.equal(match[1],top.id);
    }
    const state=await json("state");
    assert.deepEqual(state.towers,original.towers);
    assert.deepEqual(state.bridges??{},original.bridges??{});
  }
  for (const name of markers.reverse()) await chat("forget marker "+name,/^Forgot marker /);
  if (previous) assert.deepEqual((await json("session")).markers,previous.markers);
  for (const {coords,block} of supports.reverse()) {
    await cmd("execute if block "+coords+" "+block+" run setblock "+coords+" air");
  }
  if (tower.raw) compare(await survey(tower),tower.raw,"Tower plot restored");
  if (bridge.base) compare(await survey(bridge),bridge.base,"River restored");
}

try {
  report.objects={tower:{},bridge:{}};
  original=await json("state"); previous=await json("session");
  assert.ok(!original.active && !original.pending && !original.history.at(-1)?.partial);
  assert.equal(previous.provider,"codex"); assert.equal(previous.selection,null);
  assert.ok(!previous.markers.some(m=>banks.some(([name])=>name===m.name)));
  day=(await client.tool("get_time_and_weather")).dayTime;
  const rule=await cmd("gamerule minecraft:random_tick_speed");
  tickSpeed=Number(rule.output.join(" ").match(/\b(\d+)\s*$/)?.[1]); assert.ok(Number.isInteger(tickSpeed));
  if (tickSpeed) await cmd("gamerule minecraft:random_tick_speed 0");
  await runTower();
  await runBridge();
} catch (error) {
  report.failure=String(error); throw error;
} finally {
  try { await restore(); report.restored=true; }
  catch (error) {report.cleanupFailure=String(error);throw error;}
  finally {
    try {
      if (tickSpeed) await cmd("gamerule minecraft:random_tick_speed "+tickSpeed);
      if (day!==undefined) await client.tool("set_time",{time:day});
      await cmd("tp WorldStudio "+[self.x,self.y,self.z,self.yaw,self.pitch].join(" "));
    } catch (error) {report.cleanupFailure??=String(error);throw error;}
    finally {
      report.lastPhase=report.phase;
      report.phase=report.failure || report.cleanupFailure ? "failed" : "passed";
      await receipt(directory,report);
      await client.close();
    }
  }
}
