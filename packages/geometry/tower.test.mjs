import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {towerCells} from "./tower.ts";
import {circularLoft, subtract} from "./voxels.ts";

const key = ({x, y, z}) => [x, y, z].join(",");
const cellsAt = params => new Map([...towerCells(params)].map(p => [key(p), p.material]));
const digest = cells => createHash("sha256").update(
  cells.map(p => [p.x, p.y, p.z, p.material].join(",")).sort().join("\n")
).digest("hex");

test("solid, hollow and cut circular sections sample integer centres", () => {
  const shape = {bottom: -1, height: 2, radiusAt: layer => 2 - layer};
  const solid = [...circularLoft(shape)];
  assert.equal(solid.filter(p => p.y === -1).length, 13);
  assert.equal(solid.filter(p => p.y === 0).length, 5);
  const shell = [...circularLoft({...shape, thickness: 1})];
  assert.equal(shell.length, 17);
  assert.ok(!shell.some(p => p.x === 0 && p.y === -1 && p.z === 0));
  const cut = [...subtract(shell, p => p.x === 0 && p.z < 0)];
  assert.equal(cut.length, 14);
  assert.throws(() => [...circularLoft({...shape, thickness: 0})], /thickness/);
  assert.throws(() => [...circularLoft({...shape, radiusAt: () => NaN})], /radii/);
});

test("legacy QuickJS recipes produce the same occupied coordinates and materials", () => {
  // SHA-256 of sorted x,y,z,material lines expanded from the original
  // experiments/sample.js geometry action in the installed QuickJS runtime.
  const fixtures = [
    [{}, 2059, "1c25508d95753be5a389feb854eb99756159a812ba8f783adf467dc8ced0daf6"],
    [{roof: 10}, 2091, "0c642b79db150a2ce7abae74db8341ea34100ccf62332dd61359c27ddce8c272"],
    [{roof: 10, roofFinish: "black_to_grey"}, 2091, "86a623b77cffcda73296bf6c9650eeb2c1dd836655f9ad375cbd95c975f9fc4a"],
    [{height: 12, radius: 5, taper: 3, thickness: 3, roof: 4, roofFinish: "black_to_grey"},
      460, "a165cc6a8ae0042b59c376d1e5fc4b4ad90c06a1f2d100cb7107749506daceed"],
    [{height: 40, radius: 10, taper: 0, thickness: 1, roof: 16, roofFinish: "black_to_grey"},
      3432, "57c0167a1ba4e34e6da86ee05fba94d298a1a38d63eb9c1066949e9926dcc562"],
    [{height: 27, radius: 9, taper: 1, thickness: 3, roof: 7},
      3765, "06c0ddea594a00f3f0f50cb279604e1a828da83aee2e61770f9938ac4bd66f86"],
  ];
  for (const [params, count, signature] of fixtures) {
    const cells = [...towerCells(params)];
    assert.equal(cells.length, count);
    assert.equal(new Set(cells.map(key)).size, count);
    assert.equal(digest(cells), signature);
  }
});

test("brown roof matches the 258-cell live roof survey receipt", () => {
  const roof = [...towerCells({height: 30, roof: 10, roofFinish: "brown_to_tan"})].filter(p => p.y >= 30);
  assert.equal(roof.length, 258);
  // The 76df6889 survey stored after-states at world coordinates relative to (9,96,86).
  assert.equal(digest(roof), "af931ce0b2281c6afa6d5460db521e05f79f155f3a07555455d22c41b1229226");
});

test("a four-block roof raise changes only roof courses", () => {
  for (const [roofFinish, expected] of [["copper", 201], ["black_to_grey", 273], ["brown_to_tan", 254]]) {
    const old = cellsAt({roof: 10, roofFinish});
    const next = cellsAt({roof: 14, roofFinish});
    const footprint = new Set([...old.keys(), ...next.keys()]);
    const changed = [...footprint].filter(k => old.get(k) !== next.get(k));
    assert.equal(changed.length, expected);
    assert.ok(changed.every(k => Number(k.split(",")[1]) >= 30));
    assert.ok(next.has("0,43,0"));
    assert.ok(!old.has("0,43,0"));
  }
});

test("moving the arched doorway cuts the requested side and restores the old opening", () => {
  const params = {taper: 0, roofFinish: "black_to_grey"};
  const before = cellsAt(params);
  const sides = {north: [0, -7], east: [7, 0], south: [0, 7], west: [-7, 0]};
  for (const [entrance, [x, z]] of Object.entries(sides)) {
    const next = cellsAt({...params, entrance});
    assert.equal(next.size, before.size);
    assert.ok(!next.has([x, 4, z].join(",")));
    assert.equal(next.get([x, 5, z].join(",")), "stone_bricks");
    if (entrance !== "north") assert.equal(next.get("0,0,-7"), "andesite");
    for (const k of new Set([...before.keys(), ...next.keys()])) {
      const [px, y, pz] = k.split(",").map(Number);
      const inOldDoor = pz < 0 && Math.abs(px) <= 1 && y < (px === 0 ? 5 : 4);
      const across = x === 0 ? px : pz;
      const inNewDoor = px * x + pz * z > 0 && Math.abs(across) <= 1 && y < (across === 0 ? 5 : 4);
      if (!inOldDoor && !inNewDoor) assert.equal(next.get(k), before.get(k));
    }
  }
  assert.throws(() => [...towerCells({entrance: "up"})], /entrance/);
  assert.throws(() => [...towerCells({roof: 0})], /roof between/);
});
