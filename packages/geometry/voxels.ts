/** Integer coordinates relative to the design's origin. */
export interface Voxel {
  x: number;
  y: number;
  z: number;
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

/** Remove a volume defined by a predicate, leaving all other samples intact. */
export function* subtract<T extends Voxel>(cells: Iterable<T>, contains: (point: T) => boolean): Generator<T> {
  for (const cell of cells) if (!contains(cell)) yield cell;
}
