import assert from "node:assert/strict";
import {test} from "node:test";
import {previewTower,applyTower,reverseTower} from "./tower.mjs";

const air="minecraft:air", stone="minecraft:stone_bricks";
const key=(x,y,z)=>[x,y,z].join(",");
function fixture() {
  const cells=new Map();
  const client={cells,paused:false,tool:async(name,args)=>{
    if(name==="get_status")return {integratedServer:true,playerCount:1,aiPaused:client.paused};
    if(name==="get_screen")return {inWorld:true,lastWorldId:"sp:WorldStudioLab",paused:false};
    if(name==="get_self")return {dimension:"minecraft:overworld",gameMode:"creative"};
    if(name==="get_blocks_region"){
      const {from,to}=args, blocks=[];
      for(let x=from.x;x<=to.x;x++)for(let y=from.y;y<=to.y;y++)for(let z=from.z;z<=to.z;z++)
        blocks.push({x,y,z,state:cells.get(key(x,y,z))??air});
      return {blocks,volume:blocks.length,count:blocks.length,truncated:false};
    }
    assert.equal(name,"run_command");
    const text=args.command;
    assert.match(text,/^execute as WorldStudio at @s if dimension minecraft:overworld if entity @s\[gamemode=creative\]/);
    const guards=[...text.matchAll(/if block ([-\d]+) ([-\d]+) ([-\d]+) (minecraft:\w+)/g)];
    for(const [,x,y,z,before] of guards)if((cells.get(key(x,y,z))??air)!==before)return {success:false,resultValue:0};
    const [,x,y,z,tx,top,tz,after,before]=text.match(/run fill ([-\d]+) ([-\d]+) ([-\d]+) ([-\d]+) ([-\d]+) ([-\d]+) (minecraft:\w+) replace (minecraft:\w+)$/);
    assert.equal(x,tx);assert.equal(z,tz);assert.equal(guards.length,Number(top)-Number(y)+1);
    for(let py=Number(y);py<=Number(top);py++){
      assert.equal(cells.get(key(x,py,z))??air,before);
      cells.set(key(x,py,z),after);
    }
    return {success:true,resultValue:guards.length};
  }};
  return client;
}

test("preview only owns eligible tower cells; a matching preexisting block stays excluded on a later design",async()=>{
  const client=fixture(), origin={x:3,y:70,z:8};
  const dimensions={height:12,radius:5,thickness:1,taper:1,roof:5};
  const p=key(3,70,13);
  client.cells.set(p,"minecraft:andesite");
  const plan=await previewTower(client,origin,null,dimensions);
  assert.ok(plan.count>0);
  assert.equal(plan.protectedCount,1);
  assert.deepEqual(plan.excluded,[{x:3,y:70,z:13,top:70}]);
  client.cells.delete(p); // The previously occupied cell becomes eligible in live air.
  const result=await applyTower(client,plan);
  assert.equal(result.written,plan.count);
  assert.equal(result.verified,plan.count);
  assert.equal(client.cells.has(p),false);
  const followup=await previewTower(client,origin,dimensions,{...dimensions,radius:6},{exclude:plan.excluded});
  assert.equal(followup.protectedCount,1);
});

test("guarded fill survives an edit between read and commit; undo skips a later edit and only touches confirmed writes",async()=>{
  const client=fixture();
  const r={x:1,y:80,z:3,top:83,before:air,after:stone};
  const journal=[];
  let race=true;
  const result=await applyTower(client,{runs:[r]},{
    onBeforeRun:()=>{if(race){client.cells.set(key(1,81,3),"minecraft:diamond_block");race=false;}},
    onProgress:entry=>journal.push(entry),
  });
  assert.equal(result.written,3);
  assert.equal(result.skipped,1);
  assert.equal(result.verified,3);
  assert.equal(journal[0].changed,false);
  assert.equal(journal[0].run.top,83);
  client.cells.set(key(1,82,3),"minecraft:lapis_block");
  const undo=await applyTower(client,reverseTower(result.applied));
  assert.equal(undo.written,2);
  assert.equal(undo.skipped,1);
  assert.deepEqual([80,81,82,83].map(y=>client.cells.get(key(1,y,3))),[air,"minecraft:diamond_block","minecraft:lapis_block",air]);
  client.paused=true;
  await assert.rejects(()=>applyTower(client,{runs:[r]}),/Resume WorldStudioLab/);
});

test("a lost acknowledgment leaves a single uncertain write and stops subsequent runs",async()=>{
  const client=fixture();
  const first={x:4,y:110,z:2,top:110,before:air,after:stone};
  const second={...first,x:5};
  const tool=client.tool;
  client.tool=async(name,args)=>{
    const response=await tool(name,args);
    if(name==="run_command") throw Error("Lost response");
    return response;
  };
  const started=[],confirmed=[];
  await assert.rejects(()=>applyTower(client,{runs:[first,second]},{
    onBeforeRun:r=>started.push(r),onProgress:r=>confirmed.push(r)
  }),/Lost response/);
  assert.deepEqual(started,[first]);
  assert.deepEqual(confirmed,[]);
  assert.equal(client.cells.get(key(4,110,2)),stone);
  assert.equal(client.cells.has(key(5,110,2)),false);
});
