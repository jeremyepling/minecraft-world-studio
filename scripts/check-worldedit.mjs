import {connect} from "../experiments/client.mjs";
import {writeFile,readFile} from "node:fs/promises";
const c=await connect(), evidence=[];
const tool=(n,a)=>c.tool(n,a);
const xyz=(x,y,z)=>({x,y,z});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function record(label, action){
  try {const result=await action();evidence.push({label,result});console.log(label,JSON.stringify(result).slice(0,320));return result}
  catch(e){evidence.push({label,error:e.message});console.error(label,e.message.slice(0,300));}
}
async function we(message){
  await tool("send_chat",{message});await sleep(220);
  const lines=(await readFile(new URL("../local/instance/logs/latest.log",import.meta.url),"utf8")).split(/\r?\n/).filter(l=>l.includes("[System] [CHAT]")).slice(-1);
  return {message,feedback:lines[0]?.split("[CHAT] ")[1]};
}
async function scan(from,to){
  const r=await tool("get_blocks_region",{from,to,includeState:true});
  const counts={};for(const b of r.blocks)counts[b.id]=(counts[b.id]||0)+1;
  return {count:r.count,volume:r.volume,counts,examples:r.blocks.slice(0,4)};
}
const a=xyz(-35,170,-35), b=xyz(-32,171,-34), p=xyz(-26,176,-27);
const pos=n=>[n.x,n.y,n.z].join(",");
const diskName="studio_probe_"+Date.now();
try{
  const screen=await tool("get_screen");if(screen.lastWorldId!=="sp:WorldStudioLab"||!screen.inWorld)throw Error("Wrong world");
  const area=await scan(xyz(-38,167,-39),xyz(-16,180,-19));if(area.count)throw Error("Initial test footprint must be empty");
  await record("console //pos1",()=>tool("run_command",{command:"//pos1 "+pos(a)}));
  await record("console ///pos1",()=>tool("run_command",{command:"///pos1 "+pos(a)}));
  await record("player pos1",()=>we("//pos1 "+pos(a)));await record("player pos2",()=>we("//pos2 "+pos(b)));
  await record("set",()=>we("//set stone"));await record("filled cuboid",()=>scan(a,b));
  await record("undo",()=>we("//undo"));await record("after undo",()=>scan(a,b));
  await record("redo",()=>we("//redo"));await record("after redo",()=>scan(a,b));
  await record("mask",()=>we("//gmask stone"));await record("pattern",()=>we("//set 50%andesite,50%tuff"));
  await record("after mask and pattern",()=>scan(a,b));await we("//gmask");await we("//set stone");
  const placement=await record("placement origin",()=>we("/toggleplace"));
  if (!placement?.feedback?.match(/position 1|pos1|pos #1/i)) throw Error("Unexpected placement origin; refusing procedural shapes");
  await we("//copy");await record("schematic save",()=>we("//schem save "+diskName));
  await record("schematic load",()=>we("//schem load "+diskName+".schem"));await record("rotate",()=>we("//rotate 90"));
  await we("//pos1 -27,170,-34");await record("paste",()=>we("//paste -a"));
  await record("rotated paste region",()=>scan(xyz(-31,169,-38),xyz(-21,172,-30)));
  await we("//pos1 "+pos(p));await record("hollow cylinder",()=>we("//hcyl cobblestone 2 3"));
  await record("cylinder scan",()=>scan(xyz(-28,176,-29),xyz(-24,178,-25)));
  await we("//undo");await record("sphere",()=>we("//sphere tuff 2"));
  await record("sphere scan",()=>scan(xyz(-28,174,-29),xyz(-24,178,-25)));
  await we("//undo");await record("cone",()=>we("//cone bricks 2 4"));
  await record("cone scan",()=>scan(xyz(-28,176,-29),xyz(-24,179,-25)));
  await we("//undo");await we("//pos1 -28,175,-29");await we("//pos2 -24,177,-25");
  await record("expression",()=>we("//generate smooth_stone x*x+z*z<=0.5"));
  await record("expression scan",()=>scan(xyz(-28,175,-29),xyz(-24,177,-25)));
  await record("restore player placement",()=>we("/toggleplace"));
}finally{
  await writeFile(new URL("../docs/worldedit-results.json",import.meta.url),JSON.stringify(evidence,null,2)+"\n");
  await c.close();
}
