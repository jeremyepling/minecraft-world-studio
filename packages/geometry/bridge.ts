import {extrudePolygon, subtract, union, type Voxel} from "./voxels.ts";
import {quadraticBezier, sweepProfile} from "./paths.ts";
import {weatheredStone, type Weathering} from "./materials.ts";
import {architecturalStone, validateFinish, type ArchitecturalFinish, type PaintCell} from "./architectural-materials.ts";

export const bridgeDefaults = {width: 5, arch: 3, bend: 2, weathering: "none", waterline: null, drips:false, shadowSource:null} as const;
export interface BridgeParameters extends ArchitecturalFinish {
  dx: number; dy: number; dz: number;
  width?: number; arch?: number; bend?: number;
  weathering?: Weathering; waterline?: number | null;
}

export function bridgeParameters(params: BridgeParameters): Required<BridgeParameters> {
  const {dx,dy,dz,width=bridgeDefaults.width,arch=bridgeDefaults.arch,bend=bridgeDefaults.bend} = params;
  const {weathering=bridgeDefaults.weathering,waterline=bridgeDefaults.waterline} = params;
  if (![dx,dy,dz,width,arch,bend].every(Number.isSafeInteger)) throw new RangeError("Use integer bridge dimensions and marker offsets.");
  const span = Math.hypot(dx,dz);
  if (span < 6 || span > 48) throw new RangeError("Place the bridge markers 6 to 48 horizontal blocks apart.");
  if (![3,5,7,9].includes(width)) throw new RangeError("Choose an odd bridge width from 3 to 9 blocks.");
  if (arch < 1 || arch > 8) throw new RangeError("Choose a bridge arch rise from 1 to 8 blocks.");
  if (Math.abs(bend) > 8) throw new RangeError("Choose a signed bridge bend from -8 to 8 blocks.");
  if (2*arch + Math.abs(dy) > span) throw new RangeError("Use a lower arch or move the bridge markers farther apart for a walkable slope.");
  if (!["none","subtle","weathered"].includes(weathering)) throw new RangeError("Choose none, subtle or weathered stone.");
  if (waterline !== null && !Number.isSafeInteger(waterline)) throw new RangeError("Use an integer local water height.");
  validateFinish(params);
  const {drips=false,shadowSource=null}=params;
  return {dx,dy,dz,width,arch,bend,weathering,waterline,drips,shadowSource};
}

interface BridgeVoxel extends Voxel { material: string }
const baseStone = {masonry:"andesite", tread:"stone_bricks", coping:"polished_andesite", parapet:"stone_bricks"} as const;
interface BridgeSurface extends Voxel { part: keyof typeof baseStone }

/** Stone footing extending one block along the bank and three below the landing. */
function* footing(center: Voxel, toward: Voxel, width: number): Generator<BridgeSurface> {
  const length = Math.hypot(toward.x-center.x,toward.z-center.z);
  const tx = (toward.x-center.x)/length, tz = (toward.z-center.z)/length;
  const side = width/2 + 0.45;
  const corners = [[-1,-side],[1,-side],[1,side],[-1,side]].map(([along,across]) => ({
    x: center.x + along*tx - across*tz, z: center.z + along*tz + across*tx
  }));
  for (const p of extrudePolygon(corners,center.y-3,3)) yield {...p,part:"masonry"};
}

/**
 * The first marker is the bank block immediately under local (0,0,0), and the
 * second landing is (dx,dy,dz). Bend moves midspan towards (-dz,dx); arch raises
 * the midpoint above the interpolated bank heights. Width includes the coping.
 */
export function* bridgeCells(input: BridgeParameters): Generator<BridgeVoxel> {
  const params=bridgeParameters(input);
  yield* architecturalStone(bridgeSurfaces(params),params);
}

function* bridgeSurfaces({dx,dy,dz,width,arch,bend,weathering,waterline}: Required<BridgeParameters>): Generator<PaintCell> {
  const span = Math.hypot(dx,dz);
  const start = {x:0,y:0,z:0}, end = {x:dx,y:dy,z:dz};
  const control = {x:dx/2 - 2*bend*dz/span, y:dy/2+2*arch, z:dz/2 + 2*bend*dx/span};
  const path = quadraticBezier(start,control,end,2*Math.ceil(span));
  for (let i = 0; i < path.length; i++) {
    const t = i/(path.length-1);
    // Keep the bank approaches within the grade of one block per horizontal block.
    path[i].y = Math.min(path[i].y,t*span,dy+(1-t)*span);
  }
  const sweep = sweepProfile<BridgeSurface["part"]>(path,width/2,function* ({offset,t}) {
    // Leave enough clear width for a four-connected path across diagonal raster steps.
    const rim = Math.abs(offset) >= Math.max(0.95,width/2-1);
    const toBank = Math.min(t,1-t)*span;
    const depth = toBank <= 1.5 ? 3 : toBank <= 3 ? 2 : 1;
    yield {bottom:-depth,top:-1,value:"masonry"};
    yield {bottom:0,top:0,value:rim?"coping":"tread"};
    if (rim && toBank >= 1.5) yield {bottom:1,top:1,value:"parapet"};
  });
  function* deck(): Generator<BridgeSurface> {
    for (const {x,y,z,value} of sweep) yield {x,y,z,part:value};
  }
  // The named bank blocks locate the design. Leave their coordinates outside its ownership.
  const bankBlocks = [{x:0,y:-1,z:0},{x:dx,y:dy-1,z:dz}];
  const stone = subtract(union(deck(),footing(start,path[1],width),footing(end,path[path.length-2],width)),bankBlocks);
  const foundation = Math.min(0,dy)-3;
  for (const p of stone) {
    const material = weatheredStone(p,baseStone[p.part],{
      strength:weathering,waterline,foundation,role:p.part==="tread"?"tread":"masonry"
    });
    yield {x:p.x,y:p.y,z:p.z,material,paintable:p.part!=="tread"};
  }
}
