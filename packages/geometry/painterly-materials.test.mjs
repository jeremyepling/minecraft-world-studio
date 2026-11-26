import test from "node:test";
import assert from "node:assert/strict";
import {towerCells} from "./tower.ts";
import {bridgeCells,bridgeParameters} from "./bridge.ts";
import {painterlyStone,painterlyPalettes,painterlyMaterials} from "./painterly-materials.ts";

const tower={height:16,radius:5,taper:1,thickness:1,roof:6,entrance:"north"};
const bridge={dx:18,dy:0,dz:0,width:5,arch:4,bend:2};
const intent={version:1,revision:1,approach:"painterly",palette:"warm_limestone",texture:"balanced",
  focalPoint:"entrance",atmosphere:"warm stone",regions:{masonry:"a connected field of stone"}};
const key=({x,y,z})=>[x,y,z].join(",");
const wall=texture=>[...towerCells({...tower,artisticIntent:{...intent,texture}})].filter(p=>p.y<tower.height);
function transitions(cells) {
  const materials=new Map(cells.map(p=>[key(p),p.material]));
  let adjacent=0, different=0;
  for (const {x,y,z,material} of cells) {
    for (const neighbor of [[x+1,y,z],[x,y+1,z],[x,y,z+1]]) {
      const other=materials.get(neighbor.join(","));
      if (other) {adjacent++; if (other!==material) different++;}
    }
  }
  return {adjacent,different};
}

test("texture revisions change accent coverage and neighboring transitions in coherent masonry patches",()=>{
  const [quiet,balanced,expressive]=["quiet","balanced","expressive"].map(wall);
  const base=painterlyPalettes.warm_limestone.base;
  const accents=cells=>cells.filter(p=>p.material!==base).length;
  assert.ok(accents(quiet)<accents(balanced) && accents(balanced)<accents(expressive));
  const [q,b,e]=[quiet,balanced,expressive].map(transitions);
  assert.ok(q.different<b.different && b.different<e.different);
  assert.ok(b.different/b.adjacent<.3,"Most neighboring stone shares the same tone");
  const byCourse=Map.groupBy(balanced,p=>p.y);
  const variedCourses=Array.from(byCourse.values()).filter(ps=>new Set(ps.map(p=>p.material)).size>1);
  assert.ok(variedCourses.length>tower.height*.75,"Variation crosses the wall within each course");
  const palette=Object.values(painterlyPalettes.warm_limestone);
  assert.ok(balanced.every(p=>palette.includes(p.material)));
});

test("versioned palettes and descriptive revisions keep the same design-space patches and occupied states",()=>{
  assert.deepEqual(new Set(painterlyMaterials),new Set(Object.values(painterlyPalettes).flatMap(Object.values)));
  const effects={roofFinish:"brown_to_tan"};
  const before=[...towerCells({...tower,...effects})];
  for (const palette of Object.keys(painterlyPalettes)) {
    const artisticIntent={...intent,palette};
    const painted=[...towerCells({...tower,...effects,artisticIntent})];
    assert.deepEqual(painted.map(key),before.map(key));
    assert.deepEqual(painted.filter(p=>p.y>=tower.height),before.filter(p=>p.y>=tower.height));
    assert.deepEqual(painted,[...towerCells({...tower,...effects,artisticIntent:{...artisticIntent,
      revision:5,atmosphere:"overcast",focalPoint:"roof",regions:{roof:"keep quiet"}}})]);
    for (const p of painted.filter(p=>p.y<tower.height)) {
      assert.equal(p.material,painterlyStone(p,artisticIntent,0));
      assert.ok(Object.values(painterlyPalettes[palette]).includes(p.material));
      assert.deepEqual(Object.keys(p).sort(),["material","x","y","z"]);
    }
  }
  assert.deepEqual([...towerCells({...tower,...effects,artisticIntent:null})],before);
  for (const invalid of [{revision:1.5},{palette:"toString"},{texture:"extra"},{version:2},{approach:"bands"}]) {
    assert.throws(()=>[...towerCells({...tower,artisticIntent:{...intent,...invalid}})],RangeError);
    assert.throws(()=>bridgeParameters({...bridge,artisticIntent:{...intent,...invalid}}),RangeError);
  }
});

test("streaks and occluded stone use shadow tones of the chosen wall palette; roofs still occlude",()=>{
  const source={x:0,y:1024,z:0};
  const params={height:20,radius:6,taper:1,thickness:1,roof:6};
  const legacy=[...towerCells(params)];
  const mask=[...towerCells({...params,drips:true,shadowSource:source})];
  for (const palette of ["warm_limestone","red_brick"]) {
    const artisticIntent={...intent,palette};
    const base=[...towerCells({...params,artisticIntent})];
    const shaded=[...towerCells({...params,artisticIntent,drips:true,shadowSource:source})];
    const colors=painterlyPalettes[palette];
    for (const [i,p] of shaded.entries()) {
      if (mask[i].material===legacy[i].material) assert.deepEqual(p,base[i]);
      else if (mask[i].material==="deepslate_bricks") assert.equal(p.material,colors.deepShadow);
    }
    const at=(x,y,z)=>shaded.find(p=>key(p)===[x,y,z].join(",")).material;
    assert.equal(at(0,9,-5),colors.deepShadow);
    assert.equal(at(0,19,-5),colors.deepShadow);
  }
});

test("bridge finishing targets only structural masonry and honors the waterline mask and bank anchors",()=>{
  const plain=[...bridgeCells(bridge)];
  const damp={weathering:"weathered",waterline:-1};
  const effects={...damp,drips:true,shadowSource:{x:17.5,y:12.62,z:11.5}};
  const oldWet=[...bridgeCells({...bridge,...damp})];
  const oldCombined=[...bridgeCells({...bridge,...effects})];
  const artist={...intent,palette:"red_brick"};
  const red=[...bridgeCells({...bridge,artisticIntent:artist})];
  const redWet=[...bridgeCells({...bridge,...damp,artisticIntent:artist})];
  const redCombined=[...bridgeCells({...bridge,...effects,artisticIntent:artist})];
  assert.deepEqual(bridgeParameters({...bridge,artisticIntent:artist}).artisticIntent,artist);
  assert.deepEqual(redCombined.map(key),plain.map(key));
  assert.ok(!redCombined.some(p=>p.y===-1 && p.z===0 && (p.x===0 || p.x===18)));
  let wetCount=0;
  for (const [i,p] of plain.entries()) {
    if (p.material!=="andesite") {
      // All treads, coping and parapets keep the exact outputs of their existing finish.
      assert.deepEqual(redCombined[i],oldCombined[i]);
      assert.deepEqual(red[i],p);
    } else if (oldWet[i].material==="tuff_bricks") {
      wetCount++;
      assert.equal(redWet[i].material,painterlyPalettes.red_brick.shadow);
    } else if (oldWet[i].material===p.material) {
      assert.deepEqual(redWet[i],red[i]);
    }
  }
  assert.ok(wetCount>0);
});
