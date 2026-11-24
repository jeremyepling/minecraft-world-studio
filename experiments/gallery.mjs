import {readFile,writeFile,mkdir,appendFile} from "node:fs/promises";
import {connect} from "./client.mjs";

// Coordinates are reserved in the original disposable WorldStudioLab save.
const worldId="sp:WorldStudioLab", selector=process.argv[2];
if(!["tower","tower-recapture","walls","gate","road"].includes(selector)) throw Error("Choose tower, tower-recapture, walls, gate or road");
const c=await connect();
const cmd=async command => {
  const r=await c.tool("run_command",{command});
  if(!r.success) throw Error(command+" failed: "+JSON.stringify(r));
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let observer;
const root = new URL("../",import.meta.url);
const save=async record=>{
  await appendFile(new URL("experiments/live-results.jsonl",root),JSON.stringify({time:new Date().toISOString(),...record})+"\n");
  console.log(JSON.stringify(record));
};
async function photo(label, eye, target) {
  await cmd("tp @p "+eye.join(" "));
  await pause(350);
  await c.tool("look_at",{x:target[0],y:target[1],z:target[2]});
  await pause(3300);
  const bytes=await c.tool("screenshot");
  if(!Buffer.isBuffer(bytes) || bytes.subarray(1,4).toString()!=="PNG") throw Error("Screenshot was not PNG");
  await mkdir(new URL("screenshots/",root),{recursive:true});
  await writeFile(new URL("screenshots/"+label+".png",root),bytes);
  await save({capture:label,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),eye,target});
}
async function run(a, useSkill=false) {
  const args={worldId,...a};
  const script=await readFile(new URL(selector==="road"?"road.js":"sample.js",import.meta.url),"utf8");
  const text=useSkill ? await c.tool("run_skill",{name:"studio_sample",args,timeoutSeconds:300}) :
    await c.tool("run_script",{code:script,args,timeoutSeconds:300});
  const result=JSON.parse(text.split("result: ")[1].split("\n")[0]);
  await save({case:selector,args,result,summary:text.split("\n")[0]});
  return result;
}
async function applyAndVerify(args,skill=false) {
  await run({...args,action:"apply"},skill);
  const after=await run({...args,action:"inspect"},skill);
  if(after.pending!==0) throw Error("Build readback has pending cells");
}
try {
  const screen=await c.tool("get_screen");
  if(!screen.inWorld || screen.lastWorldId!==worldId || screen.screen!=="none") throw Error("Enter the lab and close menus: "+JSON.stringify(screen));
  const status=await c.tool("get_status");
  if(status.playerCount!==1 || !status.integratedServer) throw Error("Expected single-player lab");
  observer=await c.tool("get_self");
  if(observer.dimension!=="minecraft:overworld") throw Error("Expected Overworld");
  if(observer.gameMode!=="spectator") await cmd("gamemode spectator @p");
  await cmd("time set noon");
  await cmd("weather clear");
  await pause(10500); // Let player-facing camera mode feedback fade before image capture.
  if(selector==="tower" || selector==="tower-recapture") {
    const code=await readFile(new URL("sample.js",import.meta.url),"utf8");
    await c.tool("save_skill",{name:"studio_sample",description:"Parametric architectural samples, uses mc.args",code});
    const args={sample:"tower",origin:{x:25,y:167,z:42}};
    const original={height:30,radius:7,taper:2,thickness:2,roof:9};
    const variation={height:34,radius:8,taper:3,thickness:1,roof:13};
    await applyAndVerify(selector==="tower" ? args : {...args,previous:variation},true);
    await photo("tower-original-northwest",[0,189,6],[25,185,42]);
    const revised={...args,...variation,previous:original};
    await applyAndVerify(revised,true);
    await photo("tower-revised-northwest",[0,189,6],[25,185,42]);
  } else if(selector==="walls") {
    for(let style=0;style<5;style++) {
      const x=style*20;
      await applyAndVerify({sample:"wall",origin:{x,y:167,z:14},style});
      await photo("wall-"+["uniform","random","gradient","cluster","weathered"][style]+"-north",[x+7.5,170,2],[x+8,171.5,14]);
    }
  } else if(selector==="gate") {
    const args={sample:"gate",origin:{x:56,y:167,z:50}};
    await applyAndVerify(args);
    await photo("gate-initial",[61,170,34],[61,170,50]);
    const manual=await c.tool("set_block",{x:57,y:167,z:50,blockId:"minecraft:waxed_copper_block",dimension:"minecraft:overworld"});
    if(manual.state!=="minecraft:waxed_copper_block") throw Error("Sentinel missing");
    for(let revision=1;revision<=3;revision++) {
      const spec={...args,revision,previous:{revision:revision-1}};
      const inspected=await run({...spec,action:"inspect"});
      if(inspected.protectedCount!==1) throw Error("Expected manual override");
      await applyAndVerify(spec);
    }
    await photo("gate-revised",[61,170,34],[61,170,50]);
  } else {
    const [x,y,z]=process.argv.slice(3).map(Number);
    if(!(x>=0&&x<=76&&z>=7&&z<=93&&Number.isInteger(y))) throw Error("Choose a reserved positive-coordinate terrain origin");
    const args={origin:{x,y,z}};
    const inspected=await run({...args,action:"inspect"});
    if(inspected.gaps.length) throw Error("Choose another road site");
    await photo("road-before",[x-4,y+12,z-10],[x+11,y,z]);
    await run({...args,action:"apply"});
    await photo("road-after",[x-4,y+12,z-10],[x+11,y,z]);
  }
} finally {
  try {
    if(observer?.dimension==="minecraft:overworld") {
      await cmd("tp @p "+[observer.x,observer.y,observer.z,observer.yaw,observer.pitch].join(" "));
      if(observer.gameMode!=="spectator") await cmd("gamemode "+observer.gameMode+" @p");
    }
  } finally { await c.close(); }
}
