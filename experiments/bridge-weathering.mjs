import assert from "node:assert/strict";
import {readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {bridgeCells} from "../packages/geometry/bridge.ts";
import {air, command, compare, expected, key, logReply, openFixture, receipt} from "./bridge-fixture.mjs";

// node --experimental-strip-types experiments/bridge-weathering.mjs --lab-root PATH
// Start the Codex listener in that copied WorldStudioLab save before running.
const origin = {x:57, y:63, z:27};
const shape = {dx:18, dy:0, dz:0, width:5, arch:4, bend:2};
const markers = [["Weathering West Bank",57], ["Weathering East Bank",75]];
const dimension = "minecraft:overworld";
const waterY = 62;
const outside = {x:53,y:59,z:22}, end = {x:79,y:72,z:34};
const camera = [78.5,69.8,44.5], target = [66.5,65.6,28.5];
const manual = "minecraft:cut_copper";
const build = "Build a curved stone bridge from Weathering West Bank to Weathering East Bank. Set the total width to 5 blocks, arch rise to 4 and signed bend to +2.";
const paint = "Give this bridge darker, weathered stone near the waterline. Keep the upper stonework lighter and the walking surface quiet. Preserve the shape and my hand-placed blocks.";
const subtle = "Make the weathering subtler";
const applied = /^Applied ([a-f0-9]+): (\d+) cells changed, (\d+) verified/;
const undone = /^Undid ([a-f0-9]+): (\d+) cells changed, (\d+) verified/;
const {client,local,directory,self} = await openFixture("bridge-weathering");
const report = {case:"river-bridge-weathering",world:"sp:WorldStudioLab",phase:"setup",requests:[],images:[],revisions:{}};
const json = async file => JSON.parse(await readFile(join(local,"chat-loop",file+".json"),"utf8"));
const cmd = text => command(client,text);
const changed = (before,after) => [...before.keys()].filter(k => before.get(k)!==after.get(k));
const marked = [];
let base, original, previous, day, tickSpeed, sentinel, buildId, bridgeKey;

async function survey() {
  const result = new Map();
  for (let y=outside.y;y<=end.y;y+=3) {
    const top = Math.min(y+2,end.y);
    const slab = await client.tool("get_blocks_region",{dimension,from:{...outside,y},to:{...end,y:top},includeAir:true,includeState:true});
    const size = (end.x-outside.x+1)*(end.z-outside.z+1)*(top-y+1);
    assert.ok(!slab.truncated && slab.dimension===dimension && slab.volume===size && slab.blocks.length===size);
    for (const b of slab.blocks) result.set(key(b.x,b.y,b.z),b.state);
  }
  assert.equal(result.size,4914);
  return result;
}

async function chat(input,pattern) {
  const message = "@studio "+input, started = performance.now();
  const event = {phase:report.phase,message};
  report.requests.push(event);
  const line = await logReply(local,async () => {
    const result = await client.tool("send_chat",{message});
    assert.ok(result.sent && !result.asCommand);
  },line => {
    if (!line.startsWith("[AI] ")) return false;
    const text = line.slice(5);
    if (pattern.test(text)) return true;
    if (/^(Working|Thinking|Applying|Undoing|Studio ready|Planning|Previewing|Surveying|Exporting|Designing)\b/i.test(text)) return false;
    throw Error("Unexpected reply to "+message+": "+line);
  });
  event.reply = line;
  event.wallMs = Math.round(performance.now()-started);
  return line.slice(5).match(pattern);
}

function verifyWrite(match,before,after) {
  const count = changed(before,after).length;
  assert.equal(Number(match[2]),count,"Minecraft HUD changed count");
  assert.equal(Number(match[3]),count,"Minecraft HUD verified count");
  return count;
}

async function photograph(label) {
  await cmd("gamemode spectator WorldStudio");
  try {
    await cmd("tp WorldStudio "+camera.join(" ")+" facing "+target.join(" "));
    await client.tool("set_time",{time:6000});
    const view = await client.tool("get_self");
    for (const [i,axis] of ["x","y","z"].entries()) assert.ok(Math.abs(view[axis]-camera[i])<0.015);
    if (report.images.length) for (const axis of ["yaw","pitch"]) assert.ok(Math.abs(view[axis]-report.images[0][axis])<0.02);
    // Let vanilla chat, the action bar and tool status fade before reading the framebuffer.
    await delay(12000);
    const frame = await client.tool("screenshot");
    assert.ok(Buffer.isBuffer(frame) && frame.length>1000);
    const name = "bridge-"+label+"-downstream.png";
    await writeFile(join(directory,name),frame);
    const weather = await client.tool("get_time_and_weather");
    report.images.push({name,camera,target,yaw:view.yaw,pitch:view.pitch,raining:weather.raining,dayTime:weather.dayTime});
  } finally {
    // Teleport while flying so the listener receives the next turn from the bank.
    await cmd("tp WorldStudio 57.5 64 27.5 facing 62.5 65 28.5");
    await cmd("gamemode creative WorldStudio");
    await delay(1400);
  }
}

function predicted(finish) {
  return expected(base,{...shape,weathering:finish,waterline:finish==="none"?null:waterY-origin.y},bridgeCells,origin);
}

async function inspectFinish(finish,prior,start,match) {
  const state = await json("state");
  const object = state.bridges[bridgeKey];
  assert.deepEqual(object.origin,origin);
  for (const [param,value] of Object.entries(shape)) assert.equal(object.params[param],value,param);
  assert.equal(object.params.weathering,finish);
  assert.equal(object.params.waterline,waterY-origin.y);
  const want = predicted(finish);
  want.set(sentinel.point,manual);
  const actual = await survey();
  compare(actual,want,finish+" finish and surrounding river");
  const count = verifyWrite(match,prior,actual);
  const painted = changed(start,actual);
  const materials = {}, elevations = {};
  for (const point of painted) {
    const y = Number(point.split(",")[1]), block = actual.get(point);
    assert.equal(base.get(point),air,"Only generated masonry may change");
    assert.notEqual(start.get(point),air);
    assert.notEqual(block,air);
    materials[block] = (materials[block]??0)+1;
    elevations[y] = (elevations[y]??0)+1;
  }
  const dark = painted.filter(k => /:(polished_tuff|tuff_bricks)$/.test(actual.get(k)));
  const light = painted.filter(k => actual.get(k)==="minecraft:smooth_stone");
  assert.ok(dark.length && light.length,"Palette should contain both dark low stone and light upper stone");
  const meanY = points => points.reduce((sum,k) => sum+Number(k.split(",")[1]),0)/points.length;
  assert.ok(meanY(dark)<meanY(light),"Darker stone should sit lower on average");
  // A naturally occurring layer of leaves occupies the exact west marker's tread.
  const tread = ["58,64,27","66,67,29","75,63,27"];
  for (const point of tread) {
    assert.equal(start.get(point),"minecraft:stone_bricks","Center walking tread at "+point);
    assert.equal(actual.get(point),start.get(point));
  }
  for (const [,x] of markers) assert.equal(actual.get(key(x,62,27)),base.get(key(x,62,27)));
  report.revisions[finish] = {id:match[1],changedFromPrevious:count,changedFromOriginal:painted.length,
    surveyed:actual.size,materials,elevations,meanDarkY:meanY(dark),meanLightY:meanY(light),waterlineY:origin.y+object.params.waterline,
    preservedHandEdit:actual.get(sentinel.point),unchangedTreadSamples:tread};
  return actual;
}

async function undoTo(label,before,want,expectedId) {
  const top = (await json("state")).history.at(-1);
  assert.equal(top.id,expectedId);
  assert.equal(top.key,bridgeKey);
  const result = await chat("undo",undone);
  assert.equal(result[1],expectedId);
  const actual = await survey();
  compare(actual,want,label);
  report.revisions[label] = {id:expectedId,restored:verifyWrite(result,before,actual)};
}

async function restore() {
  if (original) {
    // On an assertion failure recover only newly journalled revisions of our two named banks.
    while (true) {
      const state = await json("state"), top = state.history.at(-1);
      assert.ok(!state.active,"Wait for the open transaction before recovering fixture");
      assert.deepEqual(state.history.slice(0,original.history.length),original.history);
      if (state.history.length===original.history.length) break;
      assert.equal(top.kind,"bridge");
      assert.deepEqual(top.banks,markers.map(([name]) => name));
      if (top.id===buildId && sentinel) {
        await cmd("execute if block "+sentinel.coords+" "+manual+" run setblock "+sentinel.coords+" "+sentinel.old);
        sentinel = null;
      }
      const m = await chat("undo",undone);
      assert.equal(m[1],top.id);
    }
    assert.deepEqual((await json("state")).bridges??{},original.bridges??{});
  }
  for (const name of marked.reverse()) await chat("forget marker "+name,/^Forgot marker /);
  if (previous) assert.deepEqual((await json("session")).markers,previous.markers);
  if (base) compare(await survey(),base,"river restored after removing setup bridge");
  report.restoredRiver = Boolean(base);
}

try {
  previous = await json("session"); original = await json("state");
  assert.equal(previous.provider,"codex"); assert.equal(previous.selection,null);
  assert.ok(!original.active && !original.pending && !original.history.at(-1)?.partial);
  assert.ok(!previous.markers.some(m=>markers.some(([name])=>name===m.name)));
  day = (await client.tool("get_time_and_weather")).dayTime;
  // Covering live grass can turn it to dirt underneath a landing during the run.
  // Pause random ticks, and restore the actual previous rule in finally.
  const rule = await cmd("gamerule minecraft:random_tick_speed");
  const value = rule.output.join(" ").match(/\b(\d+)\s*$/);
  assert.ok(value,"Could not read original random tick speed: "+rule.output);
  tickSpeed = Number(value[1]);
  if (tickSpeed) await cmd("gamerule minecraft:random_tick_speed 0");
  await cmd("tp WorldStudio 57.5 63 27.5 facing 67 65 29");
  base = await survey();
  for (const [,x] of markers) assert.match(base.get(key(x,62,27)),/^minecraft:grass_block/);
  assert.match(base.get("66,62,27"),/^minecraft:water/);
  for (const [name,x] of markers) {
    await chat("menu mark "+x+" 62 27 "+name,/^Marked /);
    marked.push(name);
  }

  report.phase = "build";
  const built = await chat(build,applied);
  const object = (await json("state")).history.at(-1);
  assert.deepEqual(object.banks,markers.map(([name])=>name));
  assert.equal(object.id,built[1]);
  buildId = object.id; bridgeKey = object.key;
  const raw = await survey();
  compare(raw,predicted("none"),"unweathered stone bridge");
  report.revisions.build = {id:buildId,changed:verifyWrite(built,base,raw)};

  const planned = predicted("weathered");
  const candidates = changed(raw,planned).filter(k=>raw.get(k)!==air && base.get(k)===air);
  assert.ok(candidates.length,"A hand edit must sit in the proposed material delta");
  const point = candidates[0], coords = point.replaceAll(","," "), old = raw.get(point);
  await cmd("execute if block "+coords+" "+old+" run setblock "+coords+" "+manual);
  sentinel = {point,coords,old};
  report.manualEdit = {point,before:old,placed:manual,otherwisePainted:planned.get(point),method:"conditional vanilla setblock simulating a builder's hand placement"};
  const start = new Map(raw); start.set(point,manual);
  compare(await survey(),start,"hand edit");
  await photograph("original");

  report.phase = "paint";
  const painted = await chat(paint,applied);
  const strong = await inspectFinish("weathered",start,start,painted);
  await photograph("weathered");
  report.phase = "subtler";
  const revised = await chat(subtle,applied);
  const soft = await inspectFinish("subtle",strong,start,revised);
  const faded = changed(start,soft);
  assert.ok(faded.length<changed(start,strong).length,"Subtle should reduce affected masonry");
  for (const k of faded) assert.equal(soft.get(k),strong.get(k),"Subtle material retained at "+k);
  await photograph("subtle");
  assert.ok(report.images.every(i=>i.raining===report.images[0].raining),"Screenshot weather changed");

  report.phase = "undo paint revisions";
  await undoTo("undoSubtle",soft,strong,revised[1]);
  await undoTo("undoPaint",strong,start,painted[1]);
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  report.lastPhase = report.phase;
  report.phase = "cleanup";
  try { await restore(); }
  catch (error) { report.cleanupFailure = String(error); throw error; }
  finally {
    try {
      if (tickSpeed) await cmd("gamerule minecraft:random_tick_speed "+tickSpeed);
      if (day!==undefined) await client.tool("set_time",{time:day});
      await cmd("tp WorldStudio "+[self.x,self.y,self.z,self.yaw,self.pitch].join(" "));
    } catch (error) {
      report.cleanupFailure ??= String(error);
      throw error;
    } finally {
      report.phase = report.failure || report.cleanupFailure ? "failed" : "passed";
      await receipt(directory,report);
      await client.close();
    }
  }
}
