import test from "node:test";
import assert from "node:assert/strict";
import {architecturalMaterials, architecturalStone} from "./architectural-materials.ts";
import {towerCells} from "./tower.ts";
import {bridgeCells} from "./bridge.ts";

const stone=(x,y,z,paintable=true) => ({x,y,z,material:"stone_bricks",paintable});
function wall(height,omit=()=>false) {
  const cells=[];
  for (let y=0;y<height;y++) for(let x=-4;x<=4;x++) {
    if (!omit(x,y)) cells.push(stone(x,y,0));
  }
  return cells;
}
const at=(cells,x,y,z)=>cells.find(p=>p.x===x && p.y===y && p.z===z)?.material;
const coords=cells=>cells.map(({x,y,z})=>[x,y,z]);

test("the same sill on a taller wall sheds a longer graded streak",()=>{
  const slit=(x,y)=>x===0 && (y===8 || y===9);
  for (const [height,expected] of [[12,["deepslate_bricks","polished_tuff"]],
    [40,["deepslate_bricks","deepslate_bricks","tuff_bricks","tuff_bricks","polished_tuff","polished_tuff"]]]) {
    const input=wall(height,slit);
    const result=[...architecturalStone(input,{drips:true})];
    const run=result.filter(p=>p.material!=="stone_bricks").sort((a,b)=>b.y-a.y);
    assert.deepEqual(run.map(p=>p.material),expected);
    assert.ok(run.every((p,i)=>p.x===0 && p.z===0 && p.y===7-i));
    assert.deepEqual(coords(result),coords(input));
  }
  const notch=wall(12,(x,y)=>x>=0 && y===8);
  assert.ok([...architecturalStone(notch,{drips:true})].every(p=>p.material==="stone_bricks"));
});

test("only an actual projecting blocker casts a graded shadow toward the light",()=>{
  const wallCells=wall(16);
  const overhead={x:.5,y:1024,z:.5};
  assert.ok([...architecturalStone(wallCells,{shadowSource:overhead})].every(p=>p.material==="stone_bricks"));
  const canopy=wallCells.concat(stone(0,14,-1,false));
  const source={shadowSource:overhead};
  const baked=[...architecturalStone(canopy,source)];
  assert.equal(at(baked,0,13,0),"deepslate_bricks");
  assert.equal(at(baked,0,10,0),"tuff_bricks");
  assert.equal(at(baked,0,7,0),"polished_tuff");
  assert.equal(at(baked,0,4,0),"stone_bricks");
  assert.equal(at(baked,1,13,0),"stone_bricks");
  assert.equal(at(baked,0,14,-1),"stone_bricks");
  const other=[...architecturalStone(canopy,{shadowSource:{x:0.5,y:20,z:12.5}})];
  assert.equal(at(other,0,10,0),"stone_bricks");
  assert.deepEqual(baked,[...architecturalStone(canopy,source)]);
});

test("clustered shadows vary a single course while remaining inside the cast shadow",()=>{
  const flat=wall(16);
  const eave=flat.concat(Array.from({length:9},(_,i)=>stone(i-4,14,-1,false)));
  const light={shadowSource:{x:.5,y:1024,z:.5}};
  const banded=[...architecturalStone(eave,light)];
  const options={...light,shadowVariation:true};
  const varied=[...architecturalStone(eave,options)];
  assert.deepEqual(varied,[...architecturalStone(eave,options)]);
  assert.deepEqual(coords(varied),coords(banded));
  assert.ok(varied.every((p,i)=>banded[i].material!=="stone_bricks" || p.material==="stone_bricks"));
  for (let y=7;y<13;y++) {
    const course=varied.filter(p=>p.y===y).map(p=>p.material);
    if (new Set(course).size>1) {
      assert.ok(course.some((material,i)=>i>0 && material===course[i-1] && material!=="stone_bricks"));
      return;
    }
  }
  assert.fail("The shade boundary stayed level along every course");
});

test("tower patina follows actual window sills and the chosen door while protecting finished roofs",()=>{
  const size={height:20,radius:6,taper:1,thickness:1,roof:6};
  const shadowSource={x:0,y:1024,z:0};
  for(const roofFinish of ["brown_to_tan","black_to_grey","copper"]) {
    const base=[...towerCells({...size,roofFinish})];
    assert.deepEqual([...towerCells({...size,roofFinish,drips:false,shadowSource:null})],base);
    const revised=[...towerCells({...size,roofFinish,drips:true,shadowSource})];
    assert.deepEqual(coords(revised),coords(base));
    assert.deepEqual(revised.filter(p=>p.y>=size.height),base.filter(p=>p.y>=size.height));
    assert.equal(at(revised,0,9,-5),"deepslate_bricks");
    assert.equal(at(revised,0,6,-5),"polished_tuff");
    assert.equal(at(revised,-2,3,-5),"deepslate_bricks");
    assert.equal(at(revised,0,19,-5),"deepslate_bricks");
  }
  const moved=[...towerCells({...size,entrance:"south",drips:true})];
  assert.equal(at(moved,-2,3,-5),"stone_bricks");
  assert.equal(at(moved,-2,3,5),"deepslate_bricks");
});

test("river patina preserves treads, bank marker holes and darker preexisting wet stone",()=>{
  const dims={dx:18,dy:0,dz:0,width:5,arch:4,bend:2};
  const base=[...bridgeCells(dims)];
  const damp={weathering:"weathered",waterline:-1};
  const wet=[...bridgeCells({...dims,...damp})];
  const finish={drips:true,shadowSource:{x:17.5,y:12.62,z:11.5}};
  const painted=[...bridgeCells({...dims,...damp,...finish})];
  assert.deepEqual(coords(painted),coords(base));
  assert.equal(at(painted,0,-1,0),undefined);
  assert.equal(at(painted,18,-1,0),undefined);
  assert.ok(painted.some((p,i)=>p.material!==wet[i].material));
  for(const [i,p] of base.entries()) {
    if (p.material==="stone_bricks" && at(base,p.x,p.y-1,p.z)!=="polished_andesite") {
      assert.equal(painted[i].material,p.material);
    }
    const old=architecturalMaterials.indexOf(wet[i].material);
    if (old>=0) {
      const shade=architecturalMaterials.indexOf(painted[i].material);
      assert.ok(shade>=0 && shade<=old);
    }
  }
  assert.deepEqual([...bridgeCells({...dims,...damp,drips:false,shadowSource:null})],wet);
  assert.throws(()=>[...bridgeCells({...dims,shadowSource:{x:1,y:Infinity,z:2}})],/finite local/);
  assert.throws(()=>[...towerCells({drips:"yes"})],/opening drips/);
});
