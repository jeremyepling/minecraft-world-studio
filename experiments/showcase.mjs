import {writeFile} from "node:fs/promises";
import {connect} from "./client.mjs";

const c=await connect();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  const screen=await c.tool("get_screen");
  const self=await c.tool("get_self");
  if(!screen.inWorld || screen.lastWorldId!=="sp:WorldStudioLab" || screen.screen!=="none" || self.dimension!=="minecraft:overworld")
    throw Error("Expected the open disposable Overworld");
  const cmd=async command=>{
    const r=await c.tool("run_command",{command});
    if(!r.success)throw Error("Camera command failed: "+JSON.stringify(r));
  };
  const shoot=async(label,x,y,z)=>{
    await cmd("tp @p "+[x,y,z].join(" "));
    await sleep(350);
    await c.tool("look_at",{x:9,y:111,z:86});
    await sleep(4100);
    const buf=await c.tool("screenshot");
    if(!Buffer.isBuffer(buf) || buf.subarray(1,4).toString()!=="PNG")throw Error("Expected a PNG");
    await writeFile(new URL("../screenshots/"+label+".png",import.meta.url),buf);
    return {label,x,y,z,width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
  };
  await cmd("gamemode spectator @p");
  await cmd("time set 2500");
  await cmd("weather clear");
  await sleep(11000);
  const view=await shoot("hillside-watchtower-and-road",-16,109,52);
  // Set the player's feet on a real surface so Creative mode opens at a stable viewpoint.
  const floor=await c.tool("raycast",{origin:{x:-16.5,y:156,z:51.5},direction:{x:0,y:-1,z:0},maxDistance:120,includeEntities:false});
  if(!floor.block || ["minecraft:water","minecraft:lava"].includes(floor.block.id))throw Error("Viewpoint requires a solid surface");
  const footY=floor.block.y+1;
  await cmd("tp @p -16.5 "+footY+" 51.5");
  await cmd("gamemode creative @p");
  await sleep(500);
  await c.tool("look_at",{x:9,y:112,z:86});
  await sleep(850);
  const final=await c.tool("get_self");
  if(final.gameMode!=="creative" || Math.abs(final.y-footY)>3)throw Error("Camera did not settle in Creative");
  await writeFile(new URL("showcase.json",import.meta.url),JSON.stringify({view,final:{x:final.x,y:final.y,z:final.z,yaw:final.yaw,pitch:final.pitch,gameMode:final.gameMode}},null,2)+"\n");
  console.log(view,"Final creative position",final.x,final.y,final.z);
} finally {await c.close();}
