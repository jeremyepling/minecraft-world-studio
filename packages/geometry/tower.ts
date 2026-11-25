import {circularLoft, subtract, type Voxel} from "./voxels.ts";

export type Entrance = "north" | "east" | "south" | "west";
export type RoofFinish = "copper" | "black_to_grey" | "brown_to_tan";

export const towerDefaults = {
  height: 30, radius: 7, taper: 2, thickness: 2, roof: 9,
  entrance: "north", roofFinish: "copper",
} as const;
export const towerLimits = {
  height: [12, 40], radius: [5, 10], taper: [0, 3], thickness: [1, 3], roof: [4, 16],
} as const;

export type TowerParameters = Partial<Record<keyof typeof towerLimits, number>> & {
  entrance?: Entrance;
  roofFinish?: RoofFinish;
};
export interface MaterialVoxel extends Voxel { material: string }

function dimension(key: keyof typeof towerLimits, params: TowerParameters): number {
  const value = params[key] ?? towerDefaults[key];
  const [min, max] = towerLimits[key];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Choose a ${key} between ${min} and ${max} blocks.`);
  }
  return value;
}

function doorway({x, y, z}: Voxel, entrance: Entrance): boolean {
  // Orient only the cutting volume. Wall windows and roof textures stay in local coordinates.
  const across = entrance === "north" || entrance === "south" ? x : z;
  const outward = {north: -z, east: x, south: z, west: -x}[entrance];
  return outward > 0 && Math.abs(across) <= 1 && y < (across === 0 ? 5 : 4);
}

function windowSlit({x, y, z}: Voxel): boolean {
  return y > 7 && y % 10 < 3 && ((x === 0 && z !== 0) || (z === 0 && x !== 0));
}

// Fixed value noise and interpolation preserve the original tower's clustered finish.
function noise(x: number, z: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(42, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function cloud(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const u = ease(x - ix), v = ease(z - iz);
  return lerp(lerp(noise(ix, iz), noise(ix + 1, iz), u),
    lerp(noise(ix, iz + 1), noise(ix + 1, iz + 1), u), v);
}

const slate = ["polished_blackstone", "deepslate_tiles", "deepslate_bricks", "polished_deepslate", "polished_andesite"];
const wood = ["dark_oak_planks", "spruce_planks", "jungle_planks", "oak_planks"];

/** x and z are offsets from the eave centre; rise runs from zero at the eave to one at the crest. */
export function brownRoofMaterial(x: number, z: number, rise: number): string {
  const wave = (Math.sin(0.48 * x + 0.31 * z) + Math.cos(0.29 * x - 0.52 * z)) / 2;
  const shade = Math.floor(rise * 4 + 0.62 * wave * 4 * rise * (1 - rise));
  return wood[Math.max(0, Math.min(3, shade))];
}

function roofMaterial(point: Voxel, rise: number, finish: RoofFinish): string {
  if (finish === "copper") return "waxed_weathered_cut_copper";
  if (finish === "brown_to_tan") return brownRoofMaterial(point.x, point.z, rise);
  const variation = (cloud(point.x / 2.7, point.z / 2.7) - 0.5) * 1.8;
  const shade = Math.round((slate.length - 1) * rise + variation * Math.sin(Math.PI * rise));
  return slate[Math.max(0, Math.min(slate.length - 1, shade))];
}

/** Occupied voxels of the recipe. Omitted space is left to the edit adapter's ownership checks. */
export function* towerCells(params: TowerParameters = {}): Generator<MaterialVoxel> {
  const height = dimension("height", params), radius = dimension("radius", params);
  const taper = dimension("taper", params), thickness = dimension("thickness", params);
  const roof = dimension("roof", params);
  const entrance = params.entrance ?? towerDefaults.entrance;
  const finish = params.roofFinish ?? towerDefaults.roofFinish;
  if (!["north", "east", "south", "west"].includes(entrance)) throw new RangeError("Unknown tower entrance.");
  if (!["copper", "black_to_grey", "brown_to_tan"].includes(finish)) throw new RangeError("Unknown roof finish.");

  const shaft = circularLoft({bottom: 0, height, thickness, radiusAt: y => radius - taper * y / (height - 1)});
  for (const point of subtract(shaft, p => doorway(p, entrance) || windowSlit(p))) {
    yield {...point, material: point.y < 3 ? "andesite" : "stone_bricks"};
  }
  const cap = circularLoft({bottom: height, height: roof, thickness: 1.6,
    radiusAt: layer => (radius - taper + 1) * (1 - layer / roof)});
  for (const point of cap) {
    yield {...point, material: roofMaterial(point, (point.y - height) / (roof - 1), finish)};
  }
}
