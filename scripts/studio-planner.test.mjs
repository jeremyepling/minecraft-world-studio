import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {createPlanner} from "./studio-planner.mjs";

const reply={action:"answer",target:"point",marker:null,previewOnly:false,message:"Consider a quiet stone base.",
  height:null,radius:null,thickness:null,taper:null,roof:null,roofFinish:null};

test("mock provider answers without world writes and respects interruption and capability checks",async()=>{
  const p=createPlanner({provider:"mock"});
  assert.equal(p.capabilities.persistentThreads,false);
  assert.equal((await p.ask({request:"Build something"})).action,"answer");
  assert.equal((await p.survey("Inspect the roof")).action,"inspect");
  await assert.rejects(p.ask({},AbortSignal.abort()),{name:"AbortError"});
  await assert.rejects(p.ask({},undefined,undefined,Buffer.from("data")),/does not accept screenshots/);
  await p.close();
  await assert.rejects(p.ask({}),{name:"AbortError"});
});

test("validate agent configuration before making a model call",()=>{
  assert.throws(()=>createPlanner({provider:"unknown"}),/Unknown Studio agent/);
  assert.throws(()=>createPlanner({provider:"codex"}),/private Studio session/);
  assert.throws(()=>createPlanner({provider:"ollama"}),/installed Ollama model/);
  assert.throws(()=>createPlanner({provider:"ollama",model:"test",endpoint:"http://example.com"}),/loopback/);
});

test("Ollama sends a tool-free structured request and rejects malformed designs",async t=>{
  const requests=[];
  let answer=reply;
  const server=createServer(async(req,res)=>{
    let data="";
    for await(const chunk of req)data+=chunk;
    requests.push({path:req.url,body:JSON.parse(data)});
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({done:true,message:{content:JSON.stringify(answer)}}));
  });
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const p=createPlanner({provider:"ollama",model:"test-model",endpoint:"http://127.0.0.1:"+server.address().port});
  t.after(()=>p.close());
  const context={request:"What do you think of my wall?",recent:[{reply:"Unique history token"}]};
  assert.deepEqual(await p.ask(context),reply);
  assert.equal(requests[0].path,"/api/chat");
  assert.equal(requests[0].body.model,"test-model");
  assert.equal(requests[0].body.tools,undefined);
  assert.ok(requests[0].body.format.required.includes("marker"));
  assert.match(requests[0].body.messages[0].content,/Unique history token/);
  answer={action:"paint"};
  assert.deepEqual(await p.survey("Change the roof to brown"),answer);
  assert.doesNotMatch(requests[1].body.messages[0].content,/Unique history token/);
  answer={...reply,marker:"example",height:"1000"};
  await assert.rejects(p.ask(context),/invalid height/);
  answer={...reply,command:"ignored"};
  await assert.rejects(p.ask(context),/invalid decision/);
});
