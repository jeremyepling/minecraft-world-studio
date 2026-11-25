/** Integer coordinates relative to the design's origin. */
export interface Voxel {
  x: number;
  y: number;
  z: number;
}

const key = (point: Voxel) => [point.x, point.y, point.z].join(",");

/** Combine occupied cells, keeping the first shape's data at shared coordinates. */
export function* union<T extends Voxel>(...shapes: Iterable<T>[]): Generator<T> {
  const seen = new Set<string>();
  for (const shape of shapes) for (const point of shape) {
    const position = key(point);
    if (seen.has(position)) continue;
    seen.add(position);
    yield point;
  }
}

/** Keep occupied cells from the first shape that also belong to the mask. */
export function* intersection<T extends Voxel>(shape: Iterable<T>, mask: Iterable<Voxel>): Generator<T> {
  const occupied = new Set(Array.from(mask, key));
  for (const point of shape) if (occupied.delete(key(point))) yield point;
}

export interface PlanPoint { x: number; z: number }

/** Extrude a simple XZ polygon, sampling block centres and including its boundary. */
export function* extrudePolygon(polygon: readonly PlanPoint[], bottom: number, height: number): Generator<Voxel> {
  if (polygon.length < 3 || !Number.isSafeInteger(bottom) || !Number.isSafeInteger(height) || height < 1 ||
      !Number.isSafeInteger(bottom + height - 1) || polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) {
    throw new RangeError("A polygon extrusion needs three or more finite vertices and a positive integer height.");
  }
  const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
  const minX = Math.ceil(Math.min(...xs)), maxX = Math.floor(Math.max(...xs));
  const minZ = Math.ceil(Math.min(...zs)), maxZ = Math.floor(Math.max(...zs));
  if (![minX,maxX,minZ,maxZ].every(Number.isSafeInteger)) throw new RangeError("Polygon is outside safe integer coordinates.");
  for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    let inside = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const cross = (x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x);
      if (Math.abs(cross) < 1e-8 && x >= Math.min(a.x,b.x) && x <= Math.max(a.x,b.x) &&
          z >= Math.min(a.z,b.z) && z <= Math.max(a.z,b.z)) { inside = true; break; }
      if ((a.z > z) !== (b.z > z) && x < a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z)) inside = !inside;
    }
    if (inside) for (let y = bottom; y < bottom + height; y++) yield {x,y,z};
  }
}

export interface CircularLoft {
  bottom: number;
  height: number;
  /** Outer radius at a layer, counting from zero at the bottom. */
  radiusAt: (layer: number) => number;
  /** Radial depth of the shell. Omit to produce a solid loft. */
  thickness?: number;
}

/** Sample voxel centres against a stack of circular cross-sections. */
export function* circularLoft({bottom, height, radiusAt, thickness}: CircularLoft): Generator<Voxel> {
  if (!Number.isSafeInteger(bottom) || !Number.isSafeInteger(height) || height < 1 ||
      !Number.isSafeInteger(bottom + height - 1)) {
    throw new RangeError("A loft needs an integer bottom and a positive integer height.");
  }
  if (thickness !== undefined && (!Number.isFinite(thickness) || thickness <= 0)) {
    throw new RangeError("Shell thickness must be positive and finite.");
  }
  for (let layer = 0; layer < height; layer++) {
    const outer = radiusAt(layer);
    if (!Number.isFinite(outer) || outer < 0 || !Number.isSafeInteger(Math.floor(outer))) {
      throw new RangeError("Loft radii must be finite, nonnegative voxel distances.");
    }
    const inner = thickness === undefined ? 0 : outer - thickness;
    const extent = Math.floor(outer);
    const start = 0 - extent;
    for (let z = start; z <= extent; z++) {
      for (let x = start; x <= extent; x++) {
        const distance = Math.hypot(x, z);
        if (distance >= inner && distance <= outer) yield {x, y: bottom + layer, z};
      }
    }
  }
}

/** Remove an occupied voxel mask or a volume defined by a predicate. */
export function* subtract<T extends Voxel>(cells: Iterable<T>, mask: Iterable<Voxel> | ((point: T) => boolean)): Generator<T> {
  if (typeof mask === "function") {
    for (const cell of cells) if (!mask(cell)) yield cell;
  } else {
    const removed = new Set(Array.from(mask, key));
    for (const cell of cells) if (!removed.has(key(cell))) yield cell;
  }
}
