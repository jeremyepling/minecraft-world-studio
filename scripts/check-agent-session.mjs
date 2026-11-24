import assert from "node:assert/strict";
import {mkdtemp,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {createPlanner} from "./studio-planner.mjs";

// Signed-in, opt-in test. Uses a fresh private session and never opens Minecraft.
const directory=await mkdtemp(join(tmpdir(),"worldstudio-session-check-"));
const token="Cairn-"+randomBytes(4).toString("hex");
const file=join(directory,"agent-session.json");
const context=request=>({request,site:{hit:null,selected:null,markers:[]},towers:{},recent:[]});
const opts={directory,world:"runtime-test",player:"test"};
let planner=createPlanner(opts);
try {
  const first=await planner.ask(context("Remember the exact project nickname "+token+". This is only a conversation."));
  assert.equal(first.action,"answer");
  const original=JSON.parse(await readFile(file,"utf8"));
  await planner.close();
  planner=createPlanner(opts);
  const second=await planner.ask(context("What exact nickname did I ask you to remember last turn?"));
  assert.equal(second.action,"answer");
  assert.ok(second.message.includes(token),"Previous turn was not recalled.");
  assert.equal(JSON.parse(await readFile(file,"utf8")).threadId,original.threadId);
  const survey=await planner.survey("Just inspect this roof; do not paint it.");
  assert.equal(survey.action,"inspect");
  assert.equal(JSON.parse(await readFile(file,"utf8")).threadId,original.threadId);
  const stop=new AbortController();
  await assert.rejects(planner.ask(context("What makes a tower visually interesting?"),stop.signal,label=>{
    if(label==="Thinking with Codex")setTimeout(()=>stop.abort(),500);
  }),e=>e.name==="AbortError");
  const resumed=await planner.ask(context("Repeat the exact nickname from before."));
  assert.ok(resumed.message.includes(token));
  const square=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC","base64");
  const visual=await planner.ask({...context("What is the dominant solid color of this image?"),observeOnly:true},undefined,undefined,square);
  assert.equal(visual.action,"answer");
  assert.match(visual.message,/\bred\b/i);
  console.log(JSON.stringify({provider:planner.provider,retainedThread:true,recalledAfterProcessRestart:true,
    surveyDecision:survey.action,interrupted:true,recalledAfterInterruption:true,identifiedImage:true}));
} finally {await planner.close();}
