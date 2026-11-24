import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connect } from "./client.mjs";

const c = await connect();
const result = {};
try {
  const screen = await c.tool("get_screen");
  assert.equal(screen.lastWorldId, "sp:WorldStudioLab");
  assert.equal(screen.inWorld, true);
  const self = await c.tool("get_self");
  assert.equal(self.dimension, "minecraft:overworld");
  assert.equal(self.gameMode, "creative");
  const name = "studio_gate_sample";
  const origin = {x:-70, y:190, z:32};
  const bounds = {from:origin, to:{x:-68,y:191,z:34}, includeAir:true, includeState:true};
  const before = await c.tool("get_blocks_region", bounds);
  assert.equal(before.count, 18);
  assert.ok(before.blocks.every(b => b.id === "minecraft:air"), "Choose an empty reserved plot for this one-shot fixture.");
  result.plan = await c.tool("build_plan", {name,origin,rotate:90,
    palette:{P:"minecraft:stone_bricks", S:"minecraft:stone_brick_stairs[facing=north,half=bottom]"},
    layers:[["P.P","   ","   "],["PSP","   ","   "]]});
  result.before = await c.tool("build_verify", {name});
  result.job = await c.tool("build_structure", {name,method:"set",waitSeconds:10});
  result.jobStatus = await c.tool("job_status", {waitSeconds:30});
  result.after = await c.tool("build_verify", {name});
  assert.match(result.after, /the build matches the plan/);
  const after = await c.tool("get_blocks_region", bounds);
  result.blocks = after.blocks.filter(b => b.id !== "minecraft:air");
  assert.equal(result.blocks.length, 5);
  assert.ok(result.blocks.some(b => b.state.includes("facing=east")));
  const marker = "Studio communication check " + Date.now();
  result.playerChat = await c.tool("send_chat", {message:marker});
  result.overlay = await c.tool("show_message", {text:"World Studio finished the gate sample.",actionBar:true});
  result.privateMessage = await c.tool("message_player", {player:"WorldStudio",text:"World Studio private test."});
  await new Promise(resolve=>setTimeout(resolve,600));
  const recent = await c.tool("get_recent_chat", {limit:30});
  const events = await c.tool("poll_events", {limit:60});
  result.chatReadback = JSON.stringify(recent).includes(marker);
  result.eventReadback = JSON.stringify(events).includes(marker);
  console.log(JSON.stringify(result,null,2));
  await writeFile(new URL("../docs/plan-and-chat.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
} finally {
  await c.close();
}
