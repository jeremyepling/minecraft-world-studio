import type {Voxel} from "./voxels.ts";

/** A quadratic Bézier interpolates the two endpoints through a bend towards control. */
export function quadraticBezier(start: Voxel, control: Voxel, end: Voxel, segments: number): Voxel[] {
  if (!Number.isSafeInteger(segments) || segments < 1) throw new RangeError("Choose at least one curve segment.");
  const path: Voxel[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, a = (1-t)*(1-t), b = 2*(1-t)*t, c = t*t;
    path.push({x:a*start.x+b*control.x+c*end.x, y:a*start.y+b*control.y+c*end.y, z:a*start.z+b*control.z+c*end.z});
  }
  return path;
}

export interface SweepColumn extends Voxel {
  /** Fraction of the sampled path by segment index, and distance left of the path in blocks. */
  t: number;
  offset: number;
}
export interface ProfileRun<T> { bottom: number; top: number; value: T }

/**
 * Sweep an upright cross-section along a sampled path. Each XZ column uses its nearest
 * segment, with flat end caps. The profile returns inclusive vertical runs relative to
 * the rounded path elevation at that column. Positive offset is left in the XZ plane.
 */
export function* sweepProfile<T>(path: readonly Voxel[], halfWidth: number,
    profile: (column: SweepColumn) => Iterable<ProfileRun<T>>): Generator<Voxel & {value: T}> {
  if (path.length < 2 || !Number.isFinite(halfWidth) || halfWidth <= 0 ||
      path.some(p => ![p.x,p.y,p.z].every(Number.isFinite))) throw new RangeError("Invalid sweep path or width.");
  const segments = path.slice(1).map((end,i) => {
    const start = path[i], dx = end.x-start.x, dz = end.z-start.z, length = Math.hypot(dx,dz);
    if (!length) throw new RangeError("A swept segment needs horizontal length.");
    return {start,end,dx,dz,length};
  });
  const xs = path.map(p => p.x), zs = path.map(p => p.z);
  const minX = Math.ceil(Math.min(...xs) - halfWidth), maxX = Math.floor(Math.max(...xs) + halfWidth);
  const minZ = Math.ceil(Math.min(...zs) - halfWidth), maxZ = Math.floor(Math.max(...zs) + halfWidth);
  if (![minX,maxX,minZ,maxZ].every(Number.isSafeInteger)) throw new RangeError("Sweep is outside safe integer coordinates.");
  for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    let nearest = Infinity, best = -1, fraction = 0, projection = 0;
    for (let i = 0; i < segments.length; i++) {
      const {start,dx,dz,length} = segments[i];
      const u = ((x-start.x)*dx + (z-start.z)*dz) / (length*length);
      const f = Math.max(0,Math.min(1,u));
      const distance = (x-start.x-f*dx)**2 + (z-start.z-f*dz)**2;
      if (distance < nearest) { nearest = distance; best = i; fraction = f; projection = u; }
    }
    if (nearest > halfWidth**2 || (best === 0 && projection < -1e-8) ||
        (best === segments.length-1 && projection > 1+1e-8)) continue;
    const {start,end,dx,dz} = segments[best];
    const offset = Math.sign(dx*(z-start.z) - dz*(x-start.x)) * Math.sqrt(nearest);
    const y = Math.round(start.y + fraction*(end.y-start.y));
    const t = (best+fraction) / segments.length;
    for (const run of profile({x,y,z,t,offset})) {
      if (!Number.isSafeInteger(run.bottom) || !Number.isSafeInteger(run.top) || run.bottom > run.top ||
          !Number.isSafeInteger(y+run.bottom) || !Number.isSafeInteger(y+run.top)) throw new RangeError("Invalid sweep section.");
      for (let py = y+run.bottom; py <= y+run.top; py++) yield {x,y:py,z,value:run.value};
    }
  }
}
