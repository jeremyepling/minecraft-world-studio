// Body of an MCPFabric run_script / save_skill program. Coordinates are relative to origin.
const a = mc.args;
const key = (x, y, z) => [x, y, z].join(",");
const bounded = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw Error("Integer outside fixture bounds: " + value);
  return value;
};
const palette = ["tuff", "andesite", "stone", "polished_andesite", "smooth_stone"];
function noise(x, y, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function cloud(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ease = v => v * v * (3 - 2 * v);
  const u = ease(x - ix), v = ease(y - iy);
  const lerp = (s, t, w) => s + (t - s) * w;
  return lerp(lerp(noise(ix, iy, seed), noise(ix + 1, iy, seed), u),
    lerp(noise(ix, iy + 1, seed), noise(ix + 1, iy + 1, seed), u), v);
}
function design(p) {
  const cells = new Map();
  const put = (x, y, z, id) => cells.set(key(x, y, z), id);
  if (p.sample === "tower") {
    const height = bounded(p.height ?? 30, 12, 40);
    const radius = bounded(p.radius ?? 7, 5, 10);
    const taper = bounded(p.taper ?? 2, 0, 3);
    const thickness = bounded(p.thickness ?? 2, 1, 3);
    const roof = bounded(p.roof ?? 9, 4, 16);
    for (let y = 0; y < height + roof; y++) {
      const cap = y >= height;
      const r = cap ? (radius - taper + 1) * (1 - (y - height) / roof) : radius - taper * y / (height - 1);
      for (let z = -radius - 1; z <= radius + 1; z++) {
        for (let x = -radius - 1; x <= radius + 1; x++) {
          const d = Math.hypot(x, z);
          if (d > r || (d < r - (cap ? 1.6 : thickness))) continue;
          const entrance = z < 0 && Math.abs(x) <= 1 && y < (x === 0 ? 5 : 4);
          const window = y > 7 && y % 10 < 3 && ((x === 0 && z !== 0) || (z === 0 && x !== 0));
          if (!cap && (entrance || window)) continue;
          put(x, y, z, cap ? "waxed_weathered_cut_copper" : y < 3 ? "andesite" : "stone_bricks");
        }
      }
    }
  } else if (p.sample === "wall") {
    const mode = bounded(p.style ?? 0, 0, 4);
    const seed = bounded(p.seed ?? 42, 0, 9999);
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 17; x++) {
        const field = cloud(x / 4, y / 4, seed);
        const sheltered = y < 7 && Math.abs(x - 3) <= 2;
        const light = [0.5, noise(x, y, seed), y / 8, field,
          0.37 + y / 18 + 0.55 * (field - 0.5) - (y < 2 ? 0.22 : 0) - (sheltered ? 0.18 : 0)][mode];
        put(x, y, 0, palette[Math.max(0, Math.min(4, Math.floor(light * 5)))]);
        if (y === 7 && Math.abs(x - 3) <= 2) put(x, y, -1, "stone_brick_slab");
      }
    }
  } else if (p.sample === "gate") {
    const rev = bounded(p.revision ?? 0, 0, 3);
    const door = rev >= 1 ? 7 : 3, h = rev === 3 ? 7 : 5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= 10; x++) {
        if (Math.abs(x - door) <= 1 && y < 3) continue;
        put(x, y, 0, y <= 1 && rev >= 3 ? "tuff" : "stone_bricks");
      }
    }
    for (let x = -1; x <= 11; x++) {
      const pitch = rev >= 2 ? Math.min(x + 1, 11 - x) >> 1 : 0;
      for (let z = -1; z <= 1; z++) put(x, h + pitch, z, "waxed_exposed_cut_copper");
    }
  } else {
    throw Error("Unknown sample");
  }
  return cells;
}
// Stack consecutive cells of the same material vertically without touching their neighbours.
function runs(cells) {
  const columns = new Map();
  for (const [k, id] of cells) {
    const [x, y, z] = k.split(",").map(Number);
    const col = key(x, 0, z);
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push({x, y, z, id});
  }
  const out = [];
  for (const column of columns.values()) {
    column.sort((left, right) => left.y - right.y);
    let prev;
    for (const cell of column) {
      if (prev && cell.id === prev.id && cell.y === prev.top + 1) prev.top = cell.y;
      else { prev = {...cell, top:cell.y}; out.push(prev); }
    }
  }
  return out;
}
const next = design(a);
if (a.action === "describe") return {blocks: next.size, verticalRuns: runs(next).length};
const prev = a.previous ? design({...a, ...a.previous, sample:a.sample}) : new Map();
const {x: ox, y: oy, z: oz} = a.origin;
bounded(ox, -29999900, 29999900); bounded(oz, -29999900, 29999900);
bounded(oy, -63, 263);
if (!["inspect","apply"].includes(a.action)) throw Error("Select describe, inspect or apply");
const screen = await mc.get_screen();
if (a.worldId!=="sp:WorldStudioLab" || !screen.inWorld || screen.lastWorldId !== a.worldId) throw Error("Wrong playtest world");
const changes = new Map(), protectedCells = [];
const area = [...new Set([...prev.keys(), ...next.keys()])].map(k => k.split(",").map(Number));
const edges = axis => area.map(pos => pos[axis]);
const from = {x: ox + Math.min(...edges(0)), y: oy + Math.min(...edges(1)), z: oz + Math.min(...edges(2))};
const to = {x: ox + Math.max(...edges(0)), y: oy + Math.max(...edges(1)), z: oz + Math.max(...edges(2))};
const actual = new Map();
for (let y = from.y; y <= to.y; y += 8) {
  const got = await mc.get_blocks_region({from:{...from,y}, to:{...to,y:Math.min(y+7,to.y)}, includeAir:true, dimension:"minecraft:overworld"});
  if (got.count !== got.volume || got.truncated) throw Error("Incomplete region. Load the whole sample before building.");
  for (const block of got.blocks) actual.set(key(block.x-ox,block.y-oy,block.z-oz),block.id.slice(10));
}
let already = 0;
for (const xyz of area) {
  const k = xyz.join(","), want = next.get(k) ?? "air", before = prev.get(k) ?? "air";
  const found = actual.get(k);
  if (found === want) { already++; continue; }
  if (found !== before) { protectedCells.push({k,found,before,want}); continue; }
  changes.set(k, want + "|" + before);
}
const writes = runs(changes);
let updated = 0;
if (a.action === "apply") {
  for (const r of writes) {
    const [want,before] = r.id.split("|");
    const result = await mc.run_command({command:
      "execute in minecraft:overworld run fill " + [ox+r.x,oy+r.y,oz+r.z,ox+r.x,oy+r.top,oz+r.z,"minecraft:"+want,"replace","minecraft:"+before].join(" ")});
    if (!result.success || result.resultValue !== r.top-r.y+1) throw Error("Partial edit. Inspect before retry: " + JSON.stringify(result));
    updated += result.resultValue;
  }
}
return {bounds:{from,to}, designed:next.size, already, pending:changes.size, runs:writes.length, updated,
  protectedCount:protectedCells.length, protectedExamples:protectedCells.slice(0,8)};
