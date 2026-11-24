import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { runScript, DEFAULT_LIMITS, MAX_TIMEOUT_MS, MAX_CODE_CHARS } from "../local/server/server/script/sandbox.js";

// Exercise the installed guest runtime, with an in-memory host for counting.
let received = 0;
const host = {helpers:[],call:async () => { received++; return null; }};
const result = {source:"installed MCPFabric release sandbox with an in-memory host",
  defaults:DEFAULT_LIMITS,maxTimeoutMs:MAX_TIMEOUT_MS,maxCodeChars:MAX_CODE_CHARS};
const calls = await runScript("for(let i=0;i<2001;i++) await mc.call('count',{});",host);
assert.equal(calls.stopped,"call_limit");
assert.equal(received,2000);
result.acceptedCalls = received;
const output = await runScript("mc.log('a'.repeat(17000)); return 'b'.repeat(33000);",host);
assert.ok(output.ok && output.resultTruncated && output.logTruncated);
result.resultChars = output.result.length;
result.logChars = output.logs.join("").length;
const features = await runScript("const v = new Map([[0, mc.args.n]]); await mc.sleep(1); return [v.get(0)**2,typeof BigInt,typeof process,typeof require,typeof fetch,typeof setTimeout]",host,{args:{n:6}});
assert.deepEqual(JSON.parse(features.result),[36,"function","undefined","undefined","undefined","undefined"]);
result.guest = JSON.parse(features.result);
console.log(result);
await writeFile(new URL("../docs/script-contract.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
