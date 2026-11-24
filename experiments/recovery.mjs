import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { connect } from "./client.mjs";

const first = {x:-64,y:195,z:39};
const second = {...first,x:-63};
const reader = await connect();
let actor;
const evidence = {};
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const block = async p => (await reader.tool("get_block",p)).id;
try {
  const screen = await reader.tool("get_screen");
  assert.ok(screen.lastWorldId === "sp:WorldStudioLab" && screen.inWorld);
  assert.equal((await reader.tool("get_self")).dimension,"minecraft:overworld");
  assert.equal(await block(first),"minecraft:air");
  assert.equal(await block(second),"minecraft:air");
  const args = {first,second};
  const set = "await mc.set_block({...mc.args.first,blockId:'minecraft:gold_block'}); ";
  const later = "await mc.set_block({...mc.args.second,blockId:'minecraft:gold_block'});";
  const revert = async () => {
    const r = await reader.tool("run_command",{command:"execute in minecraft:overworld if block -64 195 39 minecraft:gold_block run setblock -64 195 39 air"});
    assert.ok(r.success);
    assert.equal(await block(first),"minecraft:air");
  };
  actor = await connect();
  await assert.rejects(actor.tool("run_script",{args,code:set+"throw Error('deliberate fixture stop');"}),/deliberate fixture stop/);
  evidence.afterFailure = [await block(first),await block(second)];
  assert.deepEqual(evidence.afterFailure,["minecraft:gold_block","minecraft:air"]);
  await revert();
  evidence.conditionalRecovery = true;
  // The catalog exposes no stop_script. Closing the owning stdio client is
  // available even while its request is outstanding. Observe the world from a second client.
  const pending = actor.tool("run_script",{args,code:set+"await mc.sleep(3000); "+later}).catch(e=>String(e));
  for (let i=0;i<60 && (await block(first))==="minecraft:air";i++) await wait(40);
  assert.equal(await block(first),"minecraft:gold_block");
  await actor.close();
  actor = undefined;
  await pending;
  await wait(3300);
  evidence.afterOwnerDisconnected = [await block(first),await block(second)];
  assert.deepEqual(evidence.afterOwnerDisconnected,["minecraft:gold_block","minecraft:air"]);
  await revert();
  const start = performance.now();
  await assert.rejects(reader.tool("run_script",{code:"await mc.sleep(3000); return 'late'",timeoutSeconds:1}),/timeout|time limit|stopped after/i);
  evidence.oneSecondTimeoutMs = Math.round(performance.now()-start);
  console.log(evidence);
  await writeFile(new URL("../docs/recovery.json",import.meta.url),JSON.stringify(evidence,null,2)+"\n");
} finally {
  if (actor) await actor.close();
  await reader.close();
}
