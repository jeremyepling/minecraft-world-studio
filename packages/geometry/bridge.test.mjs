import test from "node:test";
import assert from "node:assert/strict";
import {bridgeCells, bridgeParameters, bridgeDefaults} from "./bridge.ts";
import {quadraticBezier, sweepProfile} from "./paths.ts";
import {extrudePolygon, intersection, subtract, union} from "./voxels.ts";

const key = p => [p.x,p.y,p.z].join(",");
const volume = shape => new Map(Array.from(shape,p => [key(p),p.material]));

test("concave polygon extrusions and shape booleans preserve their boundaries and data", () => {
  const polygon = [[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(([x,z]) => ({x,z}));
  const foot = [...extrudePolygon(polygon,-2,2)];
  assert.equal(foot.length,24);
  const points = new Set(foot.map(key));
  assert.ok(points.has("1,-1,3"));
  assert.ok(!points.has("2,-1,2"));
  assert.deepEqual(new Set([...extrudePolygon(polygon.toReversed(),-2,2)].map(key)),points);
  const a={x:3,y:-2,z:0,material:"top"}, b={...a,material:"bottom"};
  assert.deepEqual([...intersection([a,a],foot)],[a]);
  const joined=[...union([a],[b,{...b,y:1}])];
  assert.deepEqual([...subtract(joined,foot)],[{...b,y:1}]);
  assert.equal(joined.length,2);
  assert.equal(joined[0],a);
  assert.throws(() => [...extrudePolygon(polygon,0,-1)],RangeError);
});

test("quadratic curve and swept vertical cross-sections interpolate endpoints and bend", () => {
  const path=quadraticBezier({x:0,y:0,z:0},{x:8,y:6,z:6},{x:16,y:0,z:0},32);
  assert.deepEqual(path[16],{x:8,y:3,z:3});
  const cells=[...sweepProfile(path,1.5,() => [{bottom:-1,top:0,value:"stone"}])];
  const coords=new Set(cells.map(key));
  assert.equal(coords.size,cells.length);
  for (const p of ["0,0,0","8,3,3","8,2,3","16,0,0"]) assert.ok(coords.has(p));
  assert.ok(!coords.has("8,0,0"));
  assert.throws(() => [...sweepProfile([path[0],path[0]],2,()=>[])],RangeError);
});

test("marker positions, crown height, symmetric bend and protected anchor cells", () => {
  const p={dx:16,dz:0,dy:0,width:3,arch:2,bend:3};
  const initial=volume(bridgeCells(p));
  assert.deepEqual(volume(bridgeCells(p)),initial);
  assert.equal([...bridgeCells(p)].length,initial.size);
  assert.equal(initial.get("0,0,0"),"stone_bricks");
  assert.equal(initial.get("16,0,0"),"stone_bricks");
  assert.equal(initial.get("8,2,3"),"stone_bricks");
  assert.equal(initial.get("8,1,3"),"andesite");
  for (const k of ["8,0,3","0,-1,0","16,-1,0"]) assert.ok(!initial.has(k));
  for (const cell of bridgeCells({...p,bend:-3})) assert.equal(cell.material,initial.get(key({...cell,z:-cell.z})));
  const wider=volume(bridgeCells({...p,width:5})), raised=volume(bridgeCells({...p,width:5,arch:4}));
  assert.ok(wider.size>initial.size);
  assert.equal(wider.get("8,2,3"),"stone_bricks");
  assert.ok(!raised.has("8,2,3"));
  assert.equal(raised.get("8,4,3"),"stone_bricks");
  for (const shape of [wider,raised]) {
    assert.equal(shape.get("0,0,0"),"stone_bricks");
    assert.equal(shape.get("16,0,0"),"stone_bricks");
  }
});

/** Flood the exposed treads only. Coping-backed parapets are outside the walking lane. */
function canCross(p) {
  const columns=new Map();
  for (const cell of bridgeCells(p)) {
    const pos=[cell.x,cell.z].join(",");
    if (!columns.has(pos)) columns.set(pos,new Map());
    columns.get(pos).set(cell.y,cell.material);
  }
  const tread=new Map();
  for (const [pos,column] of columns) {
    const y=Math.max(...column.keys());
    if (column.get(y)!=="andesite" && column.get(y-1)!=="polished_andesite") tread.set(pos,y);
  }
  assert.equal(tread.get("0,0"),0);
  assert.equal(tread.get([p.dx,p.dz].join(",")),p.dy);
  const queue=[[0,0]], seen=new Set(["0,0"]);
  for (let i=0;i<queue.length;i++) {
    const [x,z]=queue[i];
    if (x===p.dx && z===p.dz) return true;
    for (const [nx,nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
      const pos=[nx,nz].join(",");
      if (seen.has(pos) || !tread.has(pos) || Math.abs(tread.get(pos)-tread.get([x,z].join(",")))>1) continue;
      queue.push([nx,nz]); seen.add(pos);
    }
  }
  return false;
}

test("the walking lane connects diagonal and unequal landings at every supported width", () => {
  for (const width of [3,5,7,9]) {
    for (const [dx,dy,dz,arch,bend] of [[6,0,6,3,3],[15,7,-11,5,-5],[0,-3,17,7,5],
      [46,2,-9,8,-7],[-6,2,0,2,8],[-18,-3,-7,6,0]]) {
      const p={dx,dy,dz,arch,bend,width};
      assert.ok(canCross(p),JSON.stringify(p));
    }
  }
});

test("bridge recipe validates dimensions before sampling the volume", () => {
  const ends={dx:16,dy:0,dz:0};
  assert.deepEqual(bridgeParameters(ends),{...ends,...bridgeDefaults});
  for (const bad of [{dx:5},{dx:49},{dy:11},{dy:0.5},{width:2},{width:4},{arch:0},{arch:9},{bend:-9},{bend:NaN}]) {
    assert.throws(() => [...bridgeCells({...ends,...bad})],RangeError);
  }
});
