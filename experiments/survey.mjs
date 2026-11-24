import {writeFile, readFile} from "node:fs/promises";
import {connect} from "./client.mjs";
const c=await connect(), worldId="sp:WorldStudioLab";
try {
  const s=await c.tool("get_screen");
  if(!s.inWorld || s.lastWorldId!==worldId) throw Error("Wrong lab world");
  const grid=await c.tool("run_script",{code:`
    const rows=[];
    for (let z=8;z<=92;z+=4) for (let x=0;x<=96;x+=4) {
      const r=await mc.raycast({origin:{x:x+0.5,y:156,z:z+0.5},direction:{x:0,y:-1,z:0},includeFluids:true,includeEntities:false,maxDistance:160});
      if(r.block) rows.push([x,z,r.block.y,r.block.id.slice(10)]);
    }
    return rows;`,timeoutSeconds:180});
  const samples=JSON.parse(grid.split("result: ")[1].split("\n")[0]);
  const surface=new Map(samples.map(([x,z,y,id])=>[[x,z].join(","),{y,id}]));
  const candidates=[];
  for(let z=12;z<=88;z+=4) for(let x=0;x<=72;x+=4) {
    const probe=samples.filter(([px,pz])=>px>=x && px<=x+24 && Math.abs(pz-z)<=4);
    if(probe.length!==21 || probe.some(hit=>!["grass_block","dirt","stone","andesite","short_grass","gravel","sand","fern"].includes(hit[3]))) continue;
    const ys=probe.map(p=>p[2]);
    const span=Math.max(...ys)-Math.min(...ys);
    if(span<12) candidates.push({x,z,y:surface.get([x,z].join(",")).y,span});
  }
  candidates.sort((l,r)=>Math.abs(l.span-3)-Math.abs(r.span-3));
  const road=await readFile(new URL("./road.js",import.meta.url),"utf8");
  const tries=[];
  for(const {x,y,z} of candidates.slice(0,75)) {
    const args={worldId,action:"inspect",origin:{x,y,z}};
    const text=await c.tool("run_script",{args,code:road});
    const r=JSON.parse(text.split("result: ")[1].split("\n")[0]);
    tries.push({x,y,z,gaps:r.gaps.length,grades:r.grades});
    if(!r.gaps.length) break;
  }
  await writeFile(new URL("./terrain-survey.json",import.meta.url),JSON.stringify({samples,candidates:candidates.length,tries})+"\n");
  console.log("Candidates",candidates.length,"Top route",tries.sort((l,r)=>l.gaps-r.gaps).slice(0,2));
}finally{await c.close();}
