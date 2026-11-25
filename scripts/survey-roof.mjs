// Read-only. Infer an isolated tower cap from the live crosshair and connected courses.
import {brownRoofMaterial} from "../packages/geometry/tower.ts";
// Only vanilla full cubes with no block-state properties or block entity. Deliberately
// exclude shape-bearing variants, even when the region API reports only the base ID.
const plain = new Set([
  "stone", "cobblestone", "mossy_cobblestone", "smooth_stone", "stone_bricks",
  "mossy_stone_bricks", "cracked_stone_bricks", "chiseled_stone_bricks",
  "bricks", "mud_bricks", "packed_mud", "tuff", "polished_tuff", "tuff_bricks",
  "blackstone", "polished_blackstone", "polished_blackstone_bricks", "cracked_polished_blackstone_bricks",
  "cobbled_deepslate", "polished_deepslate", "deepslate_bricks", "cracked_deepslate_bricks",
  "deepslate_tiles", "cracked_deepslate_tiles", "chiseled_deepslate",
  "granite", "polished_granite", "diorite", "polished_diorite", "andesite", "polished_andesite",
  "sandstone", "smooth_sandstone", "cut_sandstone", "red_sandstone", "smooth_red_sandstone",
  "nether_bricks", "red_nether_bricks", "quartz_block", "smooth_quartz", "prismarine",
  "dark_prismarine", "prismarine_bricks", "end_stone_bricks", "terracotta",
  ...["oak","spruce","birch","jungle","acacia","dark_oak","mangrove","cherry","pale_oak",
    "bamboo","crimson","warped"].map(wood => wood + "_planks"),
].map(name => "minecraft:" + name));

export function isSurveyMaterial(id) {
  return plain.has(id);
}

const cell = (x,z) => x + "," + z;
const adjacent = [[1,0],[-1,0],[0,1],[0,-1]];
function requireEvidence(ok,reason) {
  if (!ok) throw Error("Roof survey: " + reason);
}

function measure(y, blocks) {
  const xs = blocks.map(b => b.x);
  const zs = blocks.map(b => b.z);
  return {y,blocks,keys:new Set(blocks.map(b => cell(b.x,b.z))),
    ids:[...new Set(blocks.map(b => b.id))].sort(),
    minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
}

function connectedCourse(region,seeds) {
  const cells = new Map(region.map(b => [cell(b.x,b.z),b]));
  const todo = seeds.filter(k => cells.has(k));
  if (!todo.length) return [];
  // A window can split one horizontal course; each seed already touches the
  // shared 3-D component through its immediately adjacent course.
  const seen = new Set(todo);
  const queue = [...seen].map(k => cells.get(k));
  for (let i=0;i<queue.length;i++) {
    const b = queue[i];
    for (const [dx,dz] of adjacent) {
      const key = cell(b.x+dx,b.z+dz);
      if (!seen.has(key) && cells.has(key)) {
        seen.add(key);
        queue.push(cells.get(key));
      }
    }
  }
  return queue;
}

const width = s => s.maxX-s.minX+1;
const depth = s => s.maxZ-s.minZ+1;
const contains = (a,b) => a.minX<=b.minX && a.maxX>=b.maxX && a.minZ<=b.minZ && a.maxZ>=b.maxZ;

function eaveCandidate(courses,i) {
  const eave = courses[i], wall = courses[i-1], cap = courses.at(-1);
  const preceding = courses.slice(i-3,i);
  const roof = courses.slice(i);
  // A centered overhang follows a stable shaft. Its cap retracts on both axes.
  if (!preceding.every(s => width(s)===width(wall) && depth(s)===depth(wall))) return false;
  if (!(eave.minX<wall.minX && eave.maxX>wall.maxX && eave.minZ<wall.minZ && eave.maxZ>wall.maxZ)) return false;
  if (roof.length<3 || width(cap)>width(eave)/2 || depth(cap)>depth(eave)/2) return false;
  if (!roof.slice(1).every((s,j) => contains(roof[j],s))) return false;
  const wallIds = new Set(preceding.flatMap(s => s.ids));
  return eave.ids.every(id => !wallIds.has(id));
}

export async function surveyBrownRoof(c,signal) {
  const read = async (name,args) => {
    signal?.throwIfAborted();
    const result = await c.tool(name,args);
    signal?.throwIfAborted();
    return result;
  };
  const player = await read("get_self",{});
  requireEvidence(player.dimension==="minecraft:overworld" && player.gameMode==="creative","expected Creative Overworld");
  const yaw = player.yaw*Math.PI/180, pitch = player.pitch*Math.PI/180;
  const origin = {x:player.x,y:player.y+(player.sneaking?1.27:1.62),z:player.z};
  const direction = {x:-Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
  const ray = await read("raycast",{origin,direction,maxDistance:128});
  requireEvidence(ray.dimension===player.dimension && ray.hitType==="block" && !ray.block.liquid,"crosshair needs a solid block");
  const hit = ray.block;
  const radius = 24;
  const minX = hit.x-radius, maxX = hit.x+radius, minZ = hit.z-radius, maxZ = hit.z+radius;
  async function courseAt(y,seeds) {
    const r = await read("get_blocks_region",{from:{x:minX,y,z:minZ},to:{x:maxX,y,z:maxZ},limit:4096});
    requireEvidence(r.dimension===player.dimension && !r.truncated && r.blocks.length===r.count,"incomplete horizontal scan");
    const part = connectedCourse(r.blocks,seeds);
    if (!part.length) return null;
    const s = measure(y,part);
    requireEvidence(s.minX>minX && s.maxX<maxX && s.minZ>minZ && s.maxZ<maxZ,"component reaches the survey boundary");
    return s;
  }
  const base = await courseAt(hit.y,[cell(hit.x,hit.z)]);
  requireEvidence(base?.blocks.some(b => b.x===hit.x && b.z===hit.z && b.id===hit.id),"aim hit changed during survey");
  const courses = [base];
  for (;;) {
    requireEvidence(courses.length<96,"no isolated crown found within the scan height");
    const prev = courses.at(-1);
    const next = await courseAt(prev.y+1,[...prev.keys]);
    if (!next) break;
    courses.push(next);
  }
  // If the aim landed high on the roof, include lower courses until the eave can
  // be distinguished from its support. The first ray hit ties every course to the player.
  function candidates() {
    return courses.filter((s,i) => i>=3 && eaveCandidate(courses,i));
  }
  let choices = candidates();
  while (!choices.length && hit.y-courses[0].y<20) {
    const first = courses[0];
    const below = await courseAt(first.y-1,[...first.keys]);
    if (!below) break;
    courses.unshift(below);
    choices = candidates();
  }
  requireEvidence(choices.length===1,"could not isolate a unique overhanging eave with a narrowing cap");
  const eave = choices[0], roof = courses.slice(courses.indexOf(eave)), tip = roof.at(-1);
  const blocks = roof.flatMap(s => s.blocks);
  requireEvidence(blocks.every(b => isSurveyMaterial(b.id)), "roof contains a stateful or unrecognized material");
  const wall = courses[courses.indexOf(eave)-1];
  const bounds = {from:{x:eave.minX,y:eave.y,z:eave.minZ},to:{x:eave.maxX,y:tip.y,z:eave.maxZ}};
  const centerX = (eave.minX+eave.maxX)/2, centerZ = (eave.minZ+eave.maxZ)/2;
  // Detect unsupported projections, a second cap or floating decoration above the
  // silhouette that vertical-overlap tracking could otherwise silently discard.
  for (let y=eave.y;y<=tip.y+2;y++) {
    const region = await read("get_blocks_region",{from:{x:eave.minX-1,y,z:eave.minZ-1},to:{x:eave.maxX+1,y,z:eave.maxZ+1},limit:4096});
    const layer = roof[y-eave.y];
    const expected = new Map((layer?.blocks??[]).map(b => [cell(b.x,b.z),b.id]));
    requireEvidence(region.dimension===player.dimension && !region.truncated && region.count===expected.size &&
      region.blocks.length===expected.size && region.blocks.every(b => expected.get(cell(b.x,b.z))===b.id),
      "additional geometry or a changing roof makes the outline ambiguous");
  }
  const runs = [];
  let count = 0;
  for (const b of blocks.sort((a,b) => a.x-b.x || a.z-b.z || a.y-b.y)) {
    const after = "minecraft:"+brownRoofMaterial(b.x-centerX,b.z-centerZ,(b.y-eave.y)/(tip.y-eave.y));
    if (b.id===after) continue;
    count++;
    const last = runs.at(-1);
    if (last && last.x===b.x && last.z===b.z && last.top===b.y-1 && last.before===b.id && last.after===after) last.top=b.y;
    else runs.push({x:b.x,y:b.y,z:b.z,top:b.y,before:b.id,after});
  }
  return {runs,count,bounds,evidence:{
    player:{x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch},
    aimHit:hit,wall:{y:wall.y,width:width(wall),depth:depth(wall),materials:wall.ids},
    roofProfile:roof.map(s => ({y:s.y,width:width(s),depth:depth(s),blocks:s.blocks.length,materials:s.ids})),
    footprintBlocks:blocks.length,originalMaterials:[...new Set(blocks.map(b => b.id))].sort(),
    confidence:"High: the aim-connected shaft has one overhanging eave, a distinct surface material and a connected cap narrowing on both axes. The full footprint and clear air above it were reread.",
    limitations:"Recognizes isolated overhanging, tapering roofs made of supported stateless full cubes. Bounds describe the entire detected roof; runs include only changed cells."
  }};
}
