// mc.args.origin.y approximates the grade at the start. Sample a 25 x 15 x 31 site.
const {origin, worldId, action} = mc.args;
if (!["inspect","apply"].includes(action)) throw Error("Choose inspect or apply");
if (![origin.x,origin.y,origin.z].every(Number.isSafeInteger) || origin.y < -45 || origin.y > 306) throw Error("Invalid origin");
const screen = await mc.get_screen();
if (worldId!=="sp:WorldStudioLab" || !screen.inWorld || screen.lastWorldId !== worldId) throw Error("Wrong playtest world");
const natural = ["grass_block","dirt","coarse_dirt","stone","sand","gravel","andesite","podzol"];
const grass = ["short_grass","fern","tall_grass"];
const xy = (x,z) => x + "," + z;
const site = new Map(), surface = new Map();
const at = (x,y,z) => site.get([x,y,z].join(","));
for (let x = 0; x <= 24; x += 5) {
  const scan = await mc.get_blocks_region({
    from:{x:origin.x+x,y:origin.y-18,z:origin.z-7},
    to:{x:origin.x+Math.min(24,x+4),y:origin.y+12,z:origin.z+7},
    dimension:"minecraft:overworld",includeAir:true
  });
  if (scan.truncated || scan.volume !== scan.count) throw Error("Incomplete terrain scan");
  for (const b of scan.blocks) site.set([b.x-origin.x,b.y-origin.y,b.z-origin.z].join(","),b.id.slice(10));
}
for (let x=0;x<25;x++) for (let z=-7;z<=7;z++) {
  for (let y=12;y>=-18;y--) {
    const id = at(x,y,z);
    if (["air","cave_air",...grass].includes(id)) continue;
    if (natural.includes(id) && y < 11 && y > -18) surface.set(xy(x,z),y);
    break; // A canopy, an existing structure or water excludes this column.
  }
}
let last, cleared = 0;
const moves = [], grades = [], gaps = [];
const add = (x,y,z,from,to) => { if (from !== to) moves.push({x,y,z,from,to}); };
for (let x=0;x<=24;x++) {
  const mid = Math.round(3.2 * Math.sin(x/4.8)), width = x%13<4 ? 2 : 1;
  const center = surface.get(xy(x,mid));
  if (center === undefined || (last !== undefined && Math.abs(last-center)>2)) {
    gaps.push({x,mid,reason:"obstructed, wet, outside scan, or grade exceeds one block"});
    continue;
  }
  const target = last===undefined ? center : Math.max(last-1,Math.min(last+1,center));
  last = target;
  grades.push(target);
  for (let z=mid-width;z<=mid+width;z++) {
    const ground = surface.get(xy(x,z));
    if (ground === undefined || ground-target>2 || target-ground>3) { gaps.push({x,z,reason:"shoulder unsuitable"}); continue; }
    for (let y=ground+1;y<target;y++) add(x,y,z,at(x,y,z),"cobblestone");
    for (let y=target+1;y<=ground;y++) add(x,y,z,at(x,y,z),"air");
    const edge = Math.abs(z-mid) === width;
    const id = edge ? ((x+z)%3===0 ? "gravel":"coarse_dirt") : (x%6===3 ? "coarse_dirt":"dirt_path");
    add(x,target,z,at(x,target,z),id);
    for (let y=target+1;y<=Math.min(ground+2,12);y++) {
      if (grass.includes(at(x,y,z))) { add(x,y,z,at(x,y,z),"air"); cleared++; }
    }
  }
}
if (action==="apply") {
  if (gaps.length) throw Error("Route is incomplete. Inspect and choose another origin.");
  for (const {x,y,z,from,to} of moves) {
    const point = [origin.x+x,origin.y+y,origin.z+z].join(" ");
    const r = await mc.run_command({command:"execute in minecraft:overworld if block "+point+" minecraft:"+from+" run setblock "+point+" minecraft:"+to});
    if (!r.success) {
      const now=await mc.get_block({x:origin.x+x,y:origin.y+y,z:origin.z+z,dimension:"minecraft:overworld"});
      if (now.id!=="minecraft:"+to) throw Error("Grade changed during edit at "+point+"; stop and inspect");
    }
  }
  // Read independent block state after planned terrain edits and neighbour updates.
  for (const m of moves) {
    const r=await mc.get_block({x:origin.x+m.x,y:origin.y+m.y,z:origin.z+m.z,dimension:"minecraft:overworld"});
    if(r.id!=="minecraft:"+m.to) throw Error("Road readback mismatch: "+[m.x,m.y,m.z,r.id,m.to].join(" "));
  }
}
return {grades,changes:moves.length,clearedVegetation:cleared,gaps,updated:action==="apply" ? moves.length : 0};
