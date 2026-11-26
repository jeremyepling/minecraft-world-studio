import {valueNoise, weatheringPalette} from "./materials.ts";
import type {Voxel} from "./voxels.ts";

/** Solid, state-free blocks. The base covers the quiet areas between tonal accents. */
export const painterlyPalettes = {
  warm_limestone: {deepShadow:"brown_terracotta", shadow:"dripstone_block", midtone:"sandstone", base:"cut_sandstone", light:"smooth_sandstone"},
  cool_stone: {deepShadow:"deepslate_bricks", shadow:"polished_tuff", midtone:"tuff", base:"stone_bricks", light:"smooth_stone"},
  red_brick: {deepShadow:"nether_bricks", shadow:"brown_terracotta", midtone:"terracotta", base:"bricks", light:"granite"}
} as const;
export const painterlyMaterials: readonly string[] = Object.freeze(
  [...new Set(Object.values(painterlyPalettes).flatMap(palette => Object.values(palette)))]
);
export type PaletteName = keyof typeof painterlyPalettes;
const thresholds = {
  quiet: {shadow:-.29, midtone:-.19, light:.23},
  balanced: {shadow:-.18, midtone:-.075, light:.14},
  expressive: {shadow:-.13, midtone:-.035, light:.095}
} as const;
export interface ArtisticIntent {
  version: 1;
  revision: number;
  approach: "painterly";
  palette: PaletteName;
  texture: keyof typeof thresholds;
  atmosphere: string;
  focalPoint: string;
  regions: object;
}

/** Validate the executable intent once per recipe, before yielding any block changes. */
export function validateArtisticIntent(intent: ArtisticIntent | null | undefined): void {
  if (intent==null) return;
  if (intent.version!==1 || intent.approach!=="painterly" || !Number.isSafeInteger(intent.revision) || intent.revision<1)
    throw new RangeError("Use a version 1 painterly intent with an integer revision.");
  if (!Object.hasOwn(painterlyPalettes,intent.palette) || !Object.hasOwn(thresholds,intent.texture))
    throw new RangeError("Choose a registered painterly palette and texture.");
}

/** Sample a smooth 3D field by interpolating two adjacent seeded noise planes. */
function field({x,y,z}: Voxel, scale:number, seed:number): number {
  const level=Math.floor(y/scale);
  const fraction=y/scale-level;
  const mix=fraction*fraction*(3-2*fraction);
  const sample=(layer:number) => valueNoise(x/scale,z/scale,seed+layer*101);
  return (1-mix)*sample(level) + mix*sample(level+1);
}

/**
 * Paint one eligible masonry voxel. Local coordinates anchor patches across edits
 * and schematic exports. Intent revisions and descriptive metadata never reseed them.
 * Foundation height is the lowest designed course in the same local coordinates.
 */
export function painterlyStone(p:Voxel, intent:ArtisticIntent, foundation:number): string {
  const palette=painterlyPalettes[intent.palette], levels=thresholds[intent.texture];
  const macro=field(p,11,67)-.5;
  const medium=field(p,3.4,137)-.5;
  const foundationShade=.085*Math.max(0,1-Math.max(0,p.y-foundation)/6);
  const tone=.90*macro+.44*medium-foundationShade;
  if (tone<levels.shadow) return palette.shadow;
  if (tone<levels.midtone) return palette.midtone;
  if (tone>levels.light) return palette.light;
  return palette.base;
}

/** Apply a real stain or shadow without lightening already dark stone inside the mask. */
export function painterlyShade(base:string, name:PaletteName, tone:"deepShadow"|"shadow"|"midtone"): string {
  const palette=painterlyPalettes[name];
  if (base===palette.deepShadow || (tone==="midtone" && base===palette.shadow)) return base;
  return palette[tone];
}

/** Translate the existing waterline mask into tones of the selected artistic palette. */
export function painterlyWeathering(base:string, name:PaletteName, wetMaterial:string): string {
  if (wetMaterial===weatheringPalette.wet) return painterlyShade(base,name,"shadow");
  if (wetMaterial===weatheringPalette.transition) return painterlyShade(base,name,"midtone");
  if (wetMaterial===weatheringPalette.highlight) return painterlyPalettes[name].light;
  return base;
}
