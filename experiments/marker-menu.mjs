import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parseArgs} from "node:util";

// Run against a disposable Studio installation with its own running listener.
// The player (or a desktop-lease driver) presses the actual mapped menu key.
const {values} = parseArgs({options:{"lab-root":{type:"string"}}});
const root = values["lab-root"] ? resolve(values["lab-root"]) : fileURLToPath(new URL("../",import.meta.url));
const {connect} = await import(pathToFileURL(join(root,"experiments","client.mjs")));
const local = join(root,"local");
const sessionFile = join(local,"chat-loop","session.json");
const marker = "Menu-" + randomUUID().slice(0,8);
const directory = join(local,"collaboration-tests",marker);
const session = async () => JSON.parse(await readFile(sessionFile,"utf8"));

async function until(observe, description, timeout = 12000) {
  const end = Date.now() + timeout;
  do {
    const value = await observe();
    if (value) return value;
    await delay(160);
  } while (Date.now() < end);
  throw Error("Timed out waiting for " + description);
}

await mkdir(directory,{recursive:true});
const client = await connect();
let original;
let ownScreen = false;
let submittedMarker = false;
const receipt = {case:"marker-menu",marker,steps:[]};

function step(text) {
  receipt.steps.push(text);
  console.log(text);
}
async function openMenu(number) {
  step("Open World Studio menu (" + number + "/2)");
  await until(async () => {
    const screen = await client.tool("get_screen");
    assert.equal(screen.lastWorldId,"sp:WorldStudioLab");
    if (screen.screen === "none") return false;
    const ui = await client.tool("get_ui");
    return ui.widgets.some(w => w.text === "Saved markers");
  },"the menu key to open World Studio",90000);
  ownScreen = true;
}
async function button(label) {
  const ui = await client.tool("get_ui");
  const found = ui.widgets.filter(w => w.text === label && w.active);
  assert.equal(found.length,1,"Expected active button " + label + " in " + ui.widgets.map(w => w.text).join(", "));
  await client.tool("click_widget",{widget:found[0].id});
}
async function capture(filename) {
  const frame = await client.tool("screenshot");
  assert.ok(Buffer.isBuffer(frame) && frame.length > 1000,"Missing client framebuffer");
  await writeFile(join(directory,filename),frame);
}
async function send(body) {
  const result = await client.tool("send_chat",{message:"@studio " + body});
  assert.ok(result.sent && !result.asCommand);
}
async function chooseSavedMarker() {
  // This fixture adds one name after the existing saved markers.
  const pages = original.markers.length + 2;
  for (let page = 0; page < pages; page++) {
    const {widgets} = await client.tool("get_ui");
    if (widgets.some(w => w.text === marker)) {
      await button(marker);
      return;
    }
    const next = widgets.find(w => w.active && /^(next\b|[>›→])/i.test(w.text));
    assert.ok(next,"Saved marker missing from picker");
    await client.tool("click_widget",{widget:next.id});
  }
  throw Error("Pager cycled without reaching the saved marker");
}

try {
  const screen = await client.tool("get_screen");
  const self = await client.tool("get_self");
  const status = await client.tool("get_status");
  assert.ok(screen.inWorld && screen.lastWorldId === "sp:WorldStudioLab");
  assert.ok(status.integratedServer && status.playerCount === 1 && !status.aiPaused);
  assert.equal(self.dimension,"minecraft:overworld");
  assert.equal(self.gameMode,"creative");
  original = await session();
  assert.ok(!original.markers.some(m => m.name === marker));
  const ray = await client.tool("raycast",{dimension:self.dimension,
    origin:{x:self.x,y:self.y+1.62,z:self.z},yaw:self.yaw,pitch:self.pitch,maxDistance:96,includeEntities:false});
  assert.equal(ray.hitType,"block","Aim at a solid block before opening the menu");

  await openMenu(1);
  await capture("menu-home.png");
  await button("Mark this block");
  const form = await client.tool("get_ui");
  const input = form.widgets.find(w => w.type === "text_field");
  assert.ok(input,"Expected marker name field");
  await client.tool("set_text_field",{widget:input.id,text:marker});
  submittedMarker = true;
  await button("Save marker");
  const stored = await until(async () => (await session()).markers.find(m => m.name === marker),"the listener to save the menu marker");
  for (const axis of ["x","y","z"]) assert.equal(stored[axis],ray.block[axis]);
  assert.equal((await client.tool("get_screen")).screen,"none");
  ownScreen = false;
  step("Saved named marker at independent ray hit");

  await openMenu(2);
  await button("Saved markers");
  await chooseSavedMarker();
  await capture("saved-marker-actions.png");
  await button("Use this point");
  await until(async () => (await session()).selection?.from === marker,"the listener to select the picked name");
  assert.deepEqual((await session()).selection,{from:marker});
  assert.equal((await client.tool("get_screen")).screen,"none");
  ownScreen = false;
  step("Selected named point from the picker");
} catch (error) {
  receipt.error = String(error);
  throw error;
} finally {
  try {
    if (ownScreen && (await client.tool("get_screen")).screen !== "none") await client.tool("close_screen");
    if (submittedMarker && (await session()).markers.some(m => m.name === marker)) {
      if ((await session()).selection?.from === marker) {
        const old = original.selection;
        await send("select " + (old ? [old.from,old.to].filter(Boolean).join(" to ") : "clear"));
        await until(async () => (await session()).selection?.from !== marker,"the original selection");
      }
      await send("forget marker " + marker);
      await until(async () => !(await session()).markers.some(m => m.name === marker),"fixture marker removal");
    }
    if (original) {
      const final = await session();
      assert.deepEqual(final.markers,original.markers);
      assert.deepEqual(final.selection,original.selection);
    }
  } catch (error) {
    receipt.cleanupError = String(error);
    if (!receipt.error) throw error;
  } finally {
    await client.close();
    receipt.passed = !receipt.error && !receipt.cleanupError;
    const filename = join(directory,"fixture-result.json");
    await writeFile(filename,JSON.stringify(receipt,null,2)+"\n");
    console.log(receipt.passed ? "pass" : "fail",filename);
  }
}
