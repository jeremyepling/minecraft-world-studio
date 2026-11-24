import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {compileVoiceHost} from "./studio-voice.mjs";

const temp=await mkdtemp(join(tmpdir(),"worldstudio-speech-test-"));
try {
  const exe=await compileVoiceHost(temp);
  const {stdout}=await promisify(execFile)(exe,["--test","en-US"],{windowsHide:true,timeout:35000});
  const result=JSON.parse(stdout);
  assert.equal(result.identity,true);
  assert.equal(result.transcript.toLowerCase().replace(/[^a-z ]/g,"").trim(),"the river runs through the valley");
  console.log("Windows voice round trip passed. Transcript: "+result.transcript);
} finally {await rm(temp,{recursive:true,force:true});}
