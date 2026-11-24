import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setImmediate as tick} from "node:timers/promises";
import {createVoice} from "./studio-voice.mjs";

async function lab(t,authorize=async()=>true) {
  const directory=await mkdtemp(join(tmpdir(),"studio-voice-"));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const hosts=[],transcripts=[],statuses=[];
  const hostFactory=async (_dir,_instance,_cfg,event,exit)=>{
    const fake={caps:{recognition:true,synthesis:true},sent:[],stopped:false,event,exit,
      send(msg){this.sent.push(msg);},stop(){this.stopped=true;}};
    hosts.push(fake);
    return fake;
  };
  const options={directory,instanceDirectory:join(directory,"game"),authorize,
    onText:text=>transcripts.push(text),onStatus:text=>statuses.push(text),hostFactory};
  const voice=createVoice(options);
  t.after(()=>voice.close());
  return {voice,options,hosts,transcripts,statuses};
}

test("text-only default, separate persisted toggles, and all input disarmed on disconnect",async t=>{
  const {voice,options,hosts,transcripts}=await lab(t);
  voice.connect();
  assert.equal(hosts.length,0);
  await voice.configure("spoken","on");
  assert.deepEqual(hosts[0].sent.at(-1),{op:"settings",input:false,output:true});
  await hosts[0].event({type:"text",text:"unexpected"});
  assert.deepEqual(transcripts,[]);
  voice.speak("Survey complete.");
  assert.deepEqual(hosts[0].sent.at(-1),{op:"speak",text:"Survey complete."});
  await voice.configure("voice","on");
  await hosts[0].event({type:"authorize",hold:12});
  assert.deepEqual(hosts[0].sent.at(-1),{op:"grant",hold:12,allow:true});
  await hosts[0].event({type:"text",text:" Mark the bridge. "});
  assert.deepEqual(transcripts,["Mark the bridge."]);
  voice.disconnect();
  assert.equal(hosts[0].stopped,true);
  await hosts[0].event({type:"text",text:"stale"});
  assert.deepEqual(transcripts,["Mark the bridge."]);
  const fresh=createVoice(options);
  fresh.connect();await tick();
  assert.deepEqual(hosts[1].sent.at(-1),{op:"settings",input:true,output:true});
  await fresh.configure("voice","off");
  assert.deepEqual(hosts[1].sent.at(-1),{op:"settings",input:false,output:true});
  await fresh.configure("spoken","off");
  assert.equal(hosts[1].stopped,true);
  fresh.close();
});

test("a world change denies key authorization and discards pending recognition", async t=>{
  let resolveCheck;
  const {voice,hosts,transcripts}=await lab(t,()=>new Promise(r=>{resolveCheck=r;}));
  voice.connect();await voice.configure("voice","on");
  const grant=hosts[0].event({type:"authorize",hold:4});resolveCheck(false);await grant;
  assert.deepEqual(hosts[0].sent.at(-1),{op:"grant",hold:4,allow:false});
  const delivery=hosts[0].event({type:"text",text:"late message"});
  voice.disconnect();resolveCheck(true);await delivery;
  assert.deepEqual(transcripts,[]);
});

test("disabling input invalidates late transcripts even if speaking keeps the helper alive", async t=>{
  let resolveCheck;
  const {voice,hosts,transcripts}=await lab(t,()=>new Promise(r=>{resolveCheck=r;}));
  voice.connect();await voice.configure("spoken","on");await voice.configure("voice","on");
  const delivery=hosts[0].event({type:"text",text:"late message"});
  await voice.configure("voice","off");await voice.configure("voice","on");
  resolveCheck(true);await delivery;
  assert.deepEqual(transcripts,[]);
});

test("provider settings can disable recognition independently and invalid keys do not arm a microphone",async t=>{
  const {options,hosts,statuses}=await lab(t);
  await writeFile(join(options.directory,"voice.json"),JSON.stringify({inputProvider:"off"}));
  const voice=createVoice(options);voice.connect();
  await assert.rejects(()=>voice.configure("voice","on"),/provider is off/);
  assert.equal(hosts.length,0);
  await voice.configure("spoken","on");voice.close();
  await writeFile(join(options.directory,"voice.json"),'{"voice":true,"key":"every-key"}');
  const invalid=createVoice(options);invalid.connect();await tick();
  assert.equal(hosts.length,1);
  assert.ok(statuses.some(msg=>msg.includes("function key")));invalid.close();
});
