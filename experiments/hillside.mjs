import {readFile,writeFile} from "node:fs/promises";
import {connect} from "./client.mjs";
const worldId="sp:WorldStudioLab", origin={x:9,y:96,z:86};
const c=await connect();
try {
  const s=await c.tool("get_screen");
  if(!s.inWorld || s.lastWorldId!==worldId || s.screen!=="none") throw Error("Expected active lab");
  const site=await c.tool("run_script",{args:origin,code:`
    const {x,y,z}=mc.args;
    const scan=await mc.get_blocks_region({from:{x:x-7,y:y-15,z:z-7},to:{x:x+7,y:y-1,z:z+7},includeAir:true,dimension:"minecraft:overworld"});
    if(scan.count!==scan.volume || scan.truncated)throw Error("Unloaded footing");
    const columns=new Map();
    for(const b of scan.blocks){
      if(Math.hypot(b.x-x,b.z-z)>7)continue;
      const k=b.x+","+b.z;
      if(!columns.has(k))columns.set(k,[]);
      columns.get(k).push(b);
    }
    const ops=[];
    for(const col of columns.values()) {
      col.sort((a,b)=>b.y-a.y);
      const surface=col.find(b=>!["minecraft:air","minecraft:short_grass","minecraft:tall_grass","minecraft:fern"].includes(b.id));
      if(surface && ["minecraft:dirt_path","minecraft:coarse_dirt"].includes(surface.id))continue;
      if(!surface || !["grass_block","dirt","stone","gravel","andesite","granite","diorite","tuff","cobblestone"].includes(surface.id.slice(10))) throw Error("Unsuitable column "+JSON.stringify(surface??col[0]));
      for(const b of col.filter(p=>p.y>surface.y)) ops.push(b);
    }
    for(const b of ops) {
      const p=[b.x,b.y,b.z].join(" ");
      const r=await mc.run_command({command:"execute in minecraft:overworld if block "+p+" "+b.id+" run setblock "+p+" minecraft:cobblestone"});
      if(!r.success)throw Error("Foundation changed at "+p);
    }
    for(const b of ops) {
      const cur=await mc.get_block({x:b.x,y:b.y,z:b.z,dimension:"minecraft:overworld"});
      if(cur.id!=="minecraft:cobblestone")throw Error("Footing readback failed");
    }
    return {supportBlocks:ops.length,columns:columns.size};`,timeoutSeconds:300});
  const code=await readFile(new URL("sample.js",import.meta.url),"utf8"), args={worldId,sample:"tower",origin,radius:7,height:30,roof:10};
  const edit=await c.tool("run_script",{args:{...args,action:"apply"},code,timeoutSeconds:300});
  const check=await c.tool("run_script",{args:{...args,action:"inspect"},code});
  if(JSON.parse(check.split("result: ")[1]).pending!==0) throw Error("Unverified changes");
  await writeFile(new URL("hillside-results.json",import.meta.url),JSON.stringify({origin,site,edit,check},null,2)+"\n");
  console.log(site,edit,check);
}finally{await c.close();}
