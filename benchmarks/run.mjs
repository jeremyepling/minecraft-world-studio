import {appendFile,readFile} from "node:fs/promises";
import {connect} from "../experiments/client.mjs";

const [backend, size, sx, sy, sz, worldId, player] = process.argv.slice(2);
const dims = {1000:[10,10,10],10000:[25,16,25],100000:[50,40,50]}[size];
const methods = ["set","fill","command","worldedit","console-we","plan","schematic"];
const [x,y,z] = [sx,sy,sz].map(Number);
if (!dims || !methods.includes(backend) || ![x,y,z].every(Number.isSafeInteger) ||
    y < -63 || y+dims[1]>320 || worldId!=="sp:WorldStudioLab")
  throw Error("Usage: node benchmarks/run.mjs set|fill|command|worldedit|console-we|plan|schematic 1000|10000|100000 x y z sp:WorldStudioLab [player]");
if (["worldedit","schematic"].includes(backend) && !/^\w{1,16}$/.test(player ?? "")) throw Error("Supply the local player name");
const [w,h,d] = dims;
const origin = {x,y,z}, end = {x:x+w-1,y:y+h-1,z:z+d-1};
const corners = p => [p.x,p.y,p.z].join(" ");
const client = await connect();
let measuring = false;
const result = {backend,size:Number(size),origin,worldId,date:new Date().toISOString(),status:"fail",
  timedMcpRequests:0, timedBridgeCalls:backend==="plan" ? null : 0, modelCalls:0};
async function call(name,args) {
  if (measuring) {
    result.timedMcpRequests++;
    if (result.timedBridgeCalls !== null) result.timedBridgeCalls++;
  }
  return client.tool(name,args);
}
async function count(id) {
  const chunk = Math.max(1,Math.floor(3000/(w*d)));
  const counts = await call("run_script",{args:{origin,end,chunk,id},code:`
    const {origin,end,chunk,id}=mc.args;
    let matches=0, other=0;
    for(let y=origin.y;y<=end.y;y+=chunk) {
      const r=await mc.get_blocks_region({from:{...origin,y},to:{...end,y:Math.min(end.y,y+chunk-1)},dimension:"minecraft:overworld",includeAir:true});
      if(r.count!==r.volume || r.truncated) throw Error("Unloaded or truncated benchmark region");
      for (const b of r.blocks) {if (b.id===id) matches++; else other++;}
    }
    return {matches,other};`,timeoutSeconds:120});
  return JSON.parse(counts.split("result: ")[1].split("\n")[0]).matches;
}
const vanilla = command => call("run_command",{command});
async function we(command,feedback) {
  if(backend==="console-we") {
    const r=await vanilla("//"+command);
    if(!r.success || !r.output?.some(l=>feedback.test(l)))throw Error("Console WorldEdit failed: "+JSON.stringify(r));
    return r;
  }
  const log=new URL("../local/instance/logs/latest.log",import.meta.url);
  const offset=(await readFile(log)).length;
  await call("send_chat",{message:"/"+command});
  const deadline=Date.now()+12000;
  let output=[];
  do {
    await new Promise(resolve=>setTimeout(resolve,15));
    output=(await readFile(log)).subarray(offset).toString().split(/\r?\n/).filter(l=>l.includes("[System] [CHAT]")).map(l=>l.split("[CHAT] ")[1]);
    if(output.some(l=>feedback.test(l))) return {output};
  } while(Date.now()<deadline);
  throw Error("No completion for "+command+"; "+output.join(" "));
}
async function setSelection() {
  for (const [n,p] of [[1,origin],[2,end]]) {
    const r = await we("/pos"+n+" "+[p.x,p.y,p.z].join(","),/position (set to|already set)/i);
    const output=(r.output??[]).join(" ").replaceAll(" ","");
    if (!output.includes([p.x,p.y,p.z].join(",")) && !output.includes("Positionalreadyset")) throw Error("Unconfirmed WorldEdit position: "+JSON.stringify(r));
  }
}
async function fill(material, useCommand, filter) {
  const chunk = Math.max(1,Math.floor(30000/(w*d)));
  for (let base=y;base<=end.y;base+=chunk) {
    const from={...origin,y:base},to={...end,y:Math.min(end.y,base+chunk-1)};
    const r = useCommand ? await vanilla("execute in minecraft:overworld run fill "+corners(from)+" "+corners(to)+" "+material+(filter?" replace "+filter:""))
      : await call("fill_blocks",{from,to,blockId:material,dimension:"minecraft:overworld"});
    if (!r.success) throw Error("Fill failed: "+JSON.stringify(r));
  }
}
let started;
let consoleOverride=false;
try {
  const screen = await call("get_screen",{});
  if (!screen.inWorld || screen.lastWorldId!==worldId) throw Error("Wrong world");
  if (["worldedit","schematic","console-we"].includes(backend)) {
    const self=await call("get_self",{});
    if(self.dimension!=="minecraft:overworld") throw Error("WorldEdit selection must be in the Overworld");
  }
  if (["worldedit","schematic"].includes(backend)) {
    const online=await call("list_players",{});
    if(online.count!==1 || online.players[0].name!==player) throw Error("Expected the named local player alone in the lab");
  }
  if (await count("minecraft:air") !== Number(size)) throw Error("Use a fresh, all-air benchmark volume");
  if(backend==="console-we") {
    await we("/world WorldStudioLab_minecraft:overworld",/set the world override/i);
    consoleOverride=true;
  }
  const block = "minecraft:light_blue_stained_glass";
  if (backend==="schematic") {
    await setSelection();
    await fill(block,false);
    const copied=await we("/copy",/blocks affected/i);
    if(!copied.output.some(l=>l.replaceAll(",","").includes(size+" blocks affected"))) throw Error("Clipboard copy size mismatch");
    const fixture="studio_bench_"+Date.now();
    const saved=await we("/schem save "+fixture,/saved/i);
    if(!/saved/i.test(saved.output?.join(" "))) throw Error("Schematic save failed");
    await we("clearclipboard",/clipboard cleared/i);
    const loaded=await we("/schem load "+fixture+".schem",/loaded/i);
    if(!/loaded/i.test(loaded.output?.join(" "))) throw Error("Schematic load failed");
    await fill("minecraft:air",true,block);
    if (await count("minecraft:air")!==Number(size)) throw Error("Schematic setup failed");
    result.fixture=fixture;
  }
  result.tickBefore = (await vanilla("tick query")).output;
  started = performance.now();
  measuring = true;
  if (backend==="set") {
    for(let yy=y;yy<=end.y;yy++) for(let zz=z;zz<=end.z;zz++) for(let xx=x;xx<=end.x;xx++) {
      if(performance.now()-started>120000) throw Error("Two-minute individual-call budget reached");
      const r=await call("set_block",{x:xx,y:yy,z:zz,blockId:block,dimension:"minecraft:overworld"});
      if(!r.success) throw Error("set_block failed");
    }
  } else if (backend==="fill" || backend==="command") await fill(block,backend==="command");
  else if (backend==="worldedit" || backend==="console-we") { await setSelection(); result.feedback=await we("/set "+block,/operation completed/i); }
  else if (backend==="schematic") result.feedback=await we("/paste -o",/has been pasted/i);
  else {
    const plan = "studio_bench_"+size;
    await call("build_plan",{name:plan,origin,palette:{G:block},layers:Array.from({length:h},()=>Array(d).fill("G".repeat(w)))});
    let status = await call("build_structure",{name:plan,method:"set",maxSeconds:120,waitSeconds:50});
    while (status.includes("poll job_status") || /\brunning\b/i.test(status.split("\n")[0])) {
      if (performance.now()-started>130000) {await call("job_cancel",{});throw Error("Native plan job exceeded budget");}
      status=await call("job_status",{waitSeconds:10});
    }
    result.feedback=status.slice(0,1500);
  }
  measuring=false;
  result.wallMs=Math.round((performance.now()-started)*100)/100;
  result.tickAfter=(await vanilla("tick query")).output;
  result.correctBlocks=await count(block);
  result.status=result.correctBlocks===Number(size) ? "pass":"fail";
  if(result.status==="pass") {
    await fill("minecraft:air",true,block);
    if(await count("minecraft:air")!==Number(size)) throw Error("Cleanup did not restore air");
    result.restored=true;
  }
} catch(error) {
  measuring=false;
  if(started && result.wallMs===undefined) result.wallMs=Math.round(performance.now()-started);
  result.status="fail";
  result.reason=error.message;
  if(started) {
    try {result.correctBlocks=await count("minecraft:light_blue_stained_glass");}
    catch {result.correctBlocks=null;}
  }
} finally {
  measuring=false;
  if(consoleOverride) await vanilla("///world");
  await client.close();
  await appendFile(new URL("./results/trials.jsonl",import.meta.url),JSON.stringify(result)+"\n");
}
console.log(JSON.stringify(result));
if(result.status!=="pass") process.exitCode=1;
