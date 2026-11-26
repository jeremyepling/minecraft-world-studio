import test from "node:test";
import assert from "node:assert/strict";
import {bridgeCells, bridgeParameters} from "./bridge.ts";
import {weatheredStone, weatheringMaterials} from "./materials.ts";

const river = {dx:18, dy:0, dz:0, width:5, arch:4, bend:2};
const design = params => [...bridgeCells({...river,...params})];
const coordinates = cells => cells.map(({x,y,z}) => [x,y,z]);

test("legacy bridge records keep their base materials and all presets keep their silhouette", () => {
  const base = design({});
  const at = new Map(base.map(({x,y,z,material}) => [[x,y,z].join(","),material]));
  assert.equal(base.length,299);
  assert.deepEqual(design({weathering:"none",waterline:-1}),base);
  assert.equal(bridgeParameters(river).weathering,"none");
  assert.equal(bridgeParameters(river).waterline,null);
  assert.throws(() => design({weathering:"heavy"}),/weathered/);
  assert.throws(() => design({waterline:1.4}),/integer local/);
  for (const weathering of ["subtle","weathered"]) {
    const painted=design({weathering,waterline:-1});
    assert.deepEqual(coordinates(painted),coordinates(base));
    assert.deepEqual(painted,design({weathering,waterline:-1}));
    for (const [i,{x,y,z,material}] of base.entries()) {
      // On the plain bridge, the only stone bricks on a polished coping block are parapets.
      if (material==="stone_bricks" && at.get([x,y-1,z].join(","))!=="polished_andesite")
        assert.equal(painted[i].material,"stone_bricks","Keep the walking lane quiet.");
    }
  }
});

test("subtle retains the cores of stronger patches and the waterline controls the transition", () => {
  const base=design({});
  const weathered=design({weathering:"weathered",waterline:-1});
  const subtle=design({weathering:"subtle",waterline:-1});
  let strongChanges=0, subtleChanges=0;
  for (let i=0; i<base.length; i++) {
    if (weathered[i].material !== base[i].material) {
      assert.ok(weatheringMaterials.includes(weathered[i].material));
      strongChanges++;
    }
    if (subtle[i].material !== base[i].material) {
      assert.equal(subtle[i].material,weathered[i].material);
      subtleChanges++;
    }
  }
  assert.ok(subtleChanges>0 && subtleChanges < strongChanges/2);
  const dark=weathered.filter(c => c.material==="tuff_bricks");
  const light=weathered.filter(c => c.material==="smooth_stone");
  assert.ok(dark.length>0 && dark.every(p => p.y<=0));
  assert.ok(light.length>0 && light.every(p => p.y>=3));
  const dry=design({weathering:"weathered",waterline:null});
  assert.ok(dry.some(c => c.material==="polished_tuff"));
  assert.ok(dry.every(c => c.material!=="tuff_bricks"));
  const highWater=design({weathering:"weathered",waterline:2});
  assert.ok(highWater.some(c => c.material==="tuff_bricks" && c.y>=2));
});

test("one material field paints coherent stretches of vertical masonry in local coordinates", () => {
  const context={strength:"weathered",waterline:0,foundation:-3,seed:42};
  const course=Array.from({length:96},(_,x) => weatheredStone({x,y:1,z:2},"stone_bricks",context));
  assert.ok(new Set(course).size>=2);
  const agreements=course.slice(1).filter((id,i) => id===course[i]).length;
  assert.ok(agreements>course.length*0.7,"Adjacent blocks should share broad patches.");
  const reseeded=course.map((_,x) => weatheredStone({x,y:1,z:2},"stone_bricks",{...context,seed:93}));
  assert.notDeepEqual(course,reseeded);
});
