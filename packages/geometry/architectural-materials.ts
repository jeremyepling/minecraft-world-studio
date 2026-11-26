import {valueNoise} from "./materials.ts";
import type {Voxel} from "./voxels.ts";

export interface ArchitecturalFinish {
  drips?: boolean;
  /** Point emitter in local block coordinates. Block (0,0,0) has centre (.5,.5,.5). */
  shadowSource?: Voxel | null;
  shadowVariation?: boolean;
}
export const architecturalMaterials: readonly string[] = Object.freeze(["deepslate_bricks","tuff_bricks","polished_tuff"]);
export interface PaintCell extends Voxel { material: string; paintable: boolean }
type Face = {axis: "x" | "z"; sign: number};
const faces: Face[] = [{axis:"x",sign:1},{axis:"x",sign:-1},{axis:"z",sign:1},{axis:"z",sign:-1}];
const key = (x:number,y:number,z:number) => `${x},${y},${z}`;
const uv = (u:number,y:number) => `${u},${y}`;
type Ink = (p: PaintCell, strength: number) => void;

export function validateFinish({drips=false,shadowSource=null}: ArchitecturalFinish): void {
  if (typeof drips !== "boolean") throw new RangeError("Choose whether to apply opening drips.");
  if (shadowSource !== null && ![shadowSource?.x,shadowSource?.y,shadowSource?.z].every(Number.isFinite))
    throw new RangeError("Use a finite local shadow source.");
}

/** Read the first surface in each elevation, including recessed surfaces behind a doorway. */
function elevation(cells: PaintCell[], face: Face) {
  const grid = new Map<string,PaintCell>();
  const rows = new Map<number,number[]>();
  const depth = (p: PaintCell) => p[face.axis]*face.sign;
  for (const p of cells) {
    const u = face.axis === "x" ? p.z : p.x;
    const id = uv(u,p.y);
    const old = grid.get(id);
    if (!old) {
      const row = rows.get(p.y) ?? [];
      row.push(u);
      rows.set(p.y,row);
    }
    if (!old || depth(p)>depth(old)) grid.set(id,p);
  }
  return {grid,rows,depth};
}

type Gap = {u:number;y:number;lip:number};
function stainOpenings(view: ReturnType<typeof elevation>, height: number, ink: Ink) {
  const {grid,rows,depth} = view;
  const front = (u:number,y:number) => {
    const p=grid.get(uv(u,y));
    return p ? depth(p) : -Infinity;
  };
  const holes = new Map<string,Gap>();
  for (const [y,us] of rows) {
    us.sort((a,b)=>a-b);
    for (const left of us) {
      const lip=front(left,y);
      if (front(left+1,y)>=lip-1) continue;
      let right=left+2;
      while (right<=us[us.length-1] && front(right,y)<lip-1) right++;
      if (right>us[us.length-1]) continue;
      for (let u=left+1;u<right;u++) holes.set(uv(u,y),{u,y,lip:Math.min(lip,front(right,y))});
    }
  }
  const seen = new Set<string>();
  for (const [id,first] of holes) {
    if (seen.has(id)) continue;
    const gap=[first];
    seen.add(id);
    for (let i=0;i<gap.length;i++) {
      const {u,y}=gap[i];
      for (const neighbor of [uv(u-1,y),uv(u+1,y),uv(u,y-1),uv(u,y+1)]) {
        const next=holes.get(neighbor);
        if (next && !seen.has(neighbor)) {seen.add(neighbor);gap.push(next);}
      }
    }
    if (!gap.some(g=>front(g.u,g.y+1)>=g.lip-1 && !holes.has(uv(g.u,g.y+1)))) continue;
    // A matching slit on a taller facade sheds a longer streak. Broad openings
    // add a smaller second contribution, clipped by the real masonry below.
    const reach=Math.max(2,Math.min(9,Math.round(height*.135 + Math.sqrt(gap.length)*.28)));
    function trace(u:number,y:number,lip:number) {
      const run:PaintCell[]=[];
      for (let i=0;i<reach;i++) {
        const p=grid.get(uv(u,y-i));
        if (!p?.paintable || Math.abs(depth(p)-lip)>1) break;
        run.push(p);
        lip=depth(p);
      }
      return run;
    }
    function draw(run:PaintCell[]) {
      if (run.length<2) return;
      for (let i=0;i<run.length;i++) ink(run[i],1-i/(run.length-1)*0.79);
    }
    const sills=gap.filter(g=>!holes.has(uv(g.u,g.y-1)) && front(g.u,g.y-1)>=g.lip-1)
      .sort((a,b)=>a.u-b.u);
    let last=-Infinity;
    for (const g of sills) {
      if (g.u-last<3) continue;
      const run=trace(g.u,g.y-1,g.lip);
      if (run.length>=2) {draw(run);last=g.u;}
    }
    // An opening with no sill (door or bridge arch) discharges down its jambs.
    if (last!==-Infinity) continue;
    for (const side of [-1,1]) {
      let longest:PaintCell[]=[];
      for (const g of gap) {
        if (holes.has(uv(g.u+side,g.y))) continue;
        const run=trace(g.u+side,g.y,g.lip);
        if (run.length>longest.length) longest=run;
      }
      draw(longest);
    }
  }
}

/** Trace a ray from the air outside the face to the emitter. A wall cannot cast onto itself. */
function projectedShadow(p:PaintCell,face:Face,source:Voxel,occupied:Set<string>,extent:number): number {
  const x=p.x+.5+(face.axis==="x" ? face.sign*.78 : 0);
  const z=p.z+.5+(face.axis==="z" ? face.sign*.78 : 0);
  const y=p.y+.55, dx=source.x-x, dy=source.y-y, dz=source.z-z;
  if (dy<=0) return 0;
  const distance=Math.hypot(dx,dy,dz);
  // Only near-field occlusion gets baked into stone. Distant scenery remains the renderer's job.
  const reach=Math.min(9,extent);
  for (let t=.18;t<Math.min(distance,reach);t+=.25) {
    const bx=Math.floor(x+dx/distance*t), by=Math.floor(y+dy/distance*t), bz=Math.floor(z+dz/distance*t);
    if (!occupied.has(key(bx,by,bz))) continue;
    if (by<=p.y || ((face.axis==="x" ? bx-p.x : bz-p.z)*face.sign)<=0) return 0;
    return Math.max(0,1-t/reach);
  }
  return 0;
}

/** Paint existing stone only. Protected voxels still provide silhouette and cast shadows. */
export function* architecturalStone(input:Iterable<PaintCell>,options:ArchitecturalFinish): Generator<Voxel & {material:string}> {
  validateFinish(options);
  if (!options.drips && !options.shadowSource) {
    for (const {x,y,z,material} of input) yield {x,y,z,material};
    return;
  }
  const cells=Array.from(input);
  const occupied=new Set(cells.map(p=>key(p.x,p.y,p.z)));
  const strength=new Map<PaintCell,number>();
  const ink:Ink=(p,s)=>{if (p.paintable && s>.10 && s>(strength.get(p)??0)) strength.set(p,s);};
  let low=Infinity, high=-Infinity;
  for (const p of cells) {low=Math.min(low,p.y);high=Math.max(high,p.y);}
  for (const face of faces) {
    const view=elevation(cells,face);
    if (options.drips) stainOpenings(view,high-low+1,ink);
    if (options.shadowSource) {
      for (const p of view.grid.values()) {
        if (!p.paintable) continue;
        const shadow=projectedShadow(p,face,options.shadowSource,occupied,high-low+2);
        if (shadow<=.10) continue;
        // Coherent patches break up tone boundaries inside the projected shadow.
        const patch=options.shadowVariation
          ? (valueNoise((p.x+.31*p.y)/3.2,(p.z-.47*p.y)/3.2,53)-.5)*.54
          : 0;
        ink(p,shadow+patch);
      }
    }
  }
  for (const p of cells) {
    const s=strength.get(p);
    let material=p.material;
    if (s!==undefined) {
      const band=s>=.73?0:s>=.42?1:2;
      const old=architecturalMaterials.indexOf(material);
      material=architecturalMaterials[old<0?band:Math.min(old,band)];
    }
    yield {x:p.x,y:p.y,z:p.z,material};
  }
}
