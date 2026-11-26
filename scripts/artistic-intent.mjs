// Object-local art direction travels with the geometry recipe and its undo receipt.
import {painterlyPalettes} from "../packages/geometry/painterly-materials.ts";
const textures = new Set(["quiet", "balanced", "expressive"]);

export const emptyArtDecision = Object.freeze({
  artPalette: null, artTexture: null, artAtmosphere: null, artFocalPoint: null, artStyleSource: null
});

function phrase(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string" || !value.trim() || value.length > 96 || /[\u0000-\u001f]/u.test(value))
    throw Error("Choose a short, single-line description of the artistic direction.");
  return value.trim();
}

export function withArtisticIntent(params, decision, kind, source, sourceRevision=source?.revision) {
  const previous = params.artisticIntent;
  if (Object.keys(emptyArtDecision).every(key => decision[key] == null)) return params;
  if (decision.artStyleSource && !source) throw Error("Choose a registered build with saved artistic intent to match.");
  const base = source ?? previous;
  if (base && (base.version !== 1 || base.approach !== "painterly"))
    throw Error("This build uses an unsupported artistic intent version.");
  if (!base && !decision.artPalette) throw Error("Choose a masonry palette to establish an artistic direction.");
  const palette = decision.artPalette ?? base.palette;
  const texture = decision.artTexture ?? base?.texture ?? "balanced";
  if (!Object.hasOwn(painterlyPalettes,palette) || !textures.has(texture)) throw Error("Unsupported artistic palette or texture level.");
  const intent = {
    version: 1, approach: "painterly", revision: previous?.revision ?? 1, palette, texture,
    atmosphere: phrase(decision.artAtmosphere, base?.atmosphere ?? "grounded and weathered"),
    focalPoint: phrase(decision.artFocalPoint, (source && kind !== source.kind ? null : base?.focalPoint) ??
      (kind === "bridge" ? "arch and crossing" : "entrance and crown")),
    kind, regions: kind === "bridge" ? {masonry: palette, tread: "existing", coping: "existing", parapet: "existing"} :
      {walls: palette, trim: "existing", roof: "existing"}
  };
  if (decision.artStyleSource) {
    intent.styleSource = decision.artStyleSource;
    intent.styleSourceRevision = sourceRevision;
  } else if (previous?.styleSource) {
    intent.styleSource = previous.styleSource;
    intent.styleSourceRevision = previous.styleSourceRevision;
  }
  if (previous) {
    if (Object.keys(intent).every(key => key === "regions" || intent[key] === previous[key])) return params;
    intent.revision++;
  }
  return {...params, artisticIntent: intent};
}

// Only descriptive changes qualify for a zero-write journal entry. A blocked repaint never does.
export function isArtNoteOnly(plan) {
  const old = plan.previous?.artisticIntent, next = plan.next.artisticIntent;
  if (plan.count || !old || !next || old.revision === next.revision ||
      old.palette !== next.palette || old.texture !== next.texture) return false;
  const fields = new Set([...Object.keys(plan.previous), ...Object.keys(plan.next)]);
  return [...fields].every(key => key === "artisticIntent" ||
    JSON.stringify(plan.previous[key]) === JSON.stringify(plan.next[key]));
}
