import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {towerCells} from "../packages/geometry/tower.ts";
import {air,command,compare,expected,key,logReply,openFixture,receipt} from "./bridge-fixture.mjs";

// node --experimental-strip-types experiments/painterly-foundation.mjs --lab-root PATH
// Start the real Codex listener in the separate Fabric 26.3 WorldStudioLab copy.
const origin={x:9,y:211,z:86}, from={x:2,y:210,z:79}, to={x:16,y:239,z:93};
const towerKey="tower-9_211_86";
const shape={height:16,radius:5,taper:1,thickness:1,roof:6,entrance:"north",roofFinish:"copper"};
const dims="Use 16-block walls, radius 5, taper 1, wall thickness 1, a 6-block copper roof and a north entrance.";
const target=[9.5,220.8,86.5];
const camera={near:[13.5,219.5,71.5],medium:[16.5,223,60.5],far:[23.5,229,33.5]};
const applied=/^Applied ([a-f0-9]+): (\d+) cells changed, (\d+) verified/;
const undone=/^Undid ([a-f0-9]+): (\d+) cells changed, (\d+) verified/;
const {client,local,directory,self}=await openFixture("painterly-foundation");
const state=async()=>JSON.parse(await readFile(join(local,"chat-loop/state.json"),"utf8"));
const session=async()=>JSON.parse(await readFile(join(local,"chat-loop/session.json"),"utf8"));
const cmd=t=>command(client,t);
const changed=(a,b)=>[...a.keys()].filter(k=>a.get(k)!==b.get(k));
const ids=s=>s.history.map(e=>e.id);
const at=(x,y,z)=>key(x+origin.x,y+origin.y,z+origin.z);
const report={case:"painterly-foundation",world:"sp:WorldStudioLab",platform:"Fabric 26.3",inputs:[],stages:{},images:[]};
let original,blank,base,manual,day,savedStyle;
const supports=[];

async function survey(){
  const map=new Map();
  for(let y=from.y;y<=to.y;y+=4){
    const top=Math.min(y+3,to.y);
    const slab=await client.tool("get_blocks_region",{dimension:"minecraft:overworld",from:{...from,y},to:{...to,y:top},includeAir:true,includeState:true});
    assert.equal(slab.truncated,false);
    assert.equal(slab.blocks.length,225*(top-y+1));
    for(const b of slab.blocks)map.set(key(b.x,b.y,b.z),b.state);
  }
  assert.equal(map.size,6750);
  return map;
}
async function chat(input,accept){
  const message="@studio "+input, started=performance.now(),event={phase:report.phase,message};
  report.inputs.push(event);
  const reply=await logReply(local,async()=>{
    const r=await client.tool("send_chat",{message});assert.ok(r.sent && !r.asCommand);
  },line=>{
    if(!line.startsWith("[AI] "))return false;
    const body=line.slice(5);
    if(/^(Working|Thinking|Applying|Undoing|Studio ready|Planning|Previewing|Surveying|Designing)\b/i.test(body))return false;
    if(accept.test(body))return true;
    throw Error("Unexpected reply to "+message+": "+body);
  });
  event.reply=reply;event.wallMs=Math.round(performance.now()-started);
  return reply.slice(5).match(accept);
}
function predict(params){
  const map=expected(base,params,towerCells,origin);
  if(manual)map.set(manual.point,manual.after);
  return map;
}
function countWrites(result,before,after){
  const count=changed(before,after).length;
  assert.equal(Number(result[2]),count);assert.equal(Number(result[3]),count);
  assert.ok(count>0);
  return count;
}
async function revision(label,input,before){
  report.phase=label;
  const result=await chat(input,applied),s=await state(),entry=s.history.at(-1);
  assert.equal(entry.id,result[1]);assert.equal(entry.key,towerKey);
  const object=s.towers[towerKey];assert.deepEqual(object.origin,origin);
  const live=await survey();
  compare(live,predict(object.params),label+" including outside of recipe");
  report.stages[label]={id:entry.id,changed:countWrites(result,before,live),surveyed:live.size,params:object.params};
  return {id:entry.id,params:object.params,live};
}
function checkShape(stage,height){
  for(const [k,v] of Object.entries({...shape,height}))assert.equal(stage.params[k],v,k);
  assert.equal(stage.live.get(at(0,0,-5)),air,"North entrance stays open");
  assert.equal(stage.live.get(at(0,10,-4)),air,"North window stays open");
  assert.equal(stage.live.get(at(0,6,0)),air,"Tower remains hollow");
  // Center of the top layer can be hollow on this conical roof. Check the copper shell.
  assert.equal(stage.live.get(at(0,height,-5)),"minecraft:waxed_weathered_cut_copper");
}
function wallMetrics(live){
  let occupied=0, accents=0, joins=0, transitions=0;
  const ids={};
  for(let y=0;y<shape.height;y++){
    for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){
      const k=at(x,y,z),block=live.get(k);
      if(block===air || k===manual?.point)continue;
      occupied++;if(block!=="minecraft:cut_sandstone")accents++;
      ids[block]=(ids[block]??0)+1;
      for(const [dx,dy,dz] of [[1,0,0],[0,1,0],[0,0,1]]){
        if(y+dy>=shape.height)continue;
        const next=at(x+dx,y+dy,z+dz),adjacent=live.get(next);
        if(!adjacent || adjacent===air || next===manual?.point)continue;
        joins++;if(block!==adjacent)transitions++;
      }
    }
  }
  return {occupied,accents,joins,transitions,materials:ids};
}
async function photos(label,views){
  await cmd("gamemode spectator WorldStudio");
  try{
    for(const view of views){
      const point=camera[view];
      await cmd("tp WorldStudio "+point.join(" ")+" facing "+target.join(" "));
      await client.tool("set_time",{time:6000});
      const s=await client.tool("get_self");
      for(const [i,axis] of ["x","y","z"].entries())assert.ok(Math.abs(s[axis]-point[i])<.02);
      const previous=report.images.find(row=>row.view===view);
      if(previous)for(const axis of ["yaw","pitch"])assert.ok(Math.abs(s[axis]-previous[axis])<.02);
      await delay(12000);
      const image=await client.tool("screenshot");
      assert.ok(Buffer.isBuffer(image) && image.length>1000);
      const name="painterly-"+label+"-"+view+".png";
      await writeFile(join(directory,name),image);
      const weather=await client.tool("get_time_and_weather");
      if(previous)assert.equal(weather.raining,previous.raining);
      report.images.push({name,view,point,target,yaw:s.yaw,pitch:s.pitch,dayTime:weather.dayTime,raining:weather.raining});
    }
  }finally{
    await cmd("tp WorldStudio "+camera.medium.join(" ")+" facing "+target.join(" "));
    await cmd("gamemode creative WorldStudio");await delay(1400);
  }
}
async function undo(stage,before,want){
  report.phase="undo "+stage.id;
  assert.equal((await state()).history.at(-1).id,stage.id);
  const result=await chat("undo",undone);assert.equal(result[1],stage.id);
  const live=await survey();compare(live,want,report.phase);
  (report.undos??=[]).push({id:stage.id,changed:countWrites(result,before,live)});
}
async function support(coords,block){
  await cmd("setblock "+coords+" "+block+" keep");supports.push([coords,block]);
}
async function restoreProjectStyle(){
  const prior=original.projectStyles??[], current=(await state()).projectStyles??[];
  if(savedStyle && current.length>prior.length){
    assert.deepEqual(current,[...prior,savedStyle],"Only restore the fixture's saved style");
    await chat("restore previous project style",/^(?:Restored project style v\d+\.|Cleared the project's first saved style\.)$/);
  }
  assert.deepEqual((await state()).projectStyles??[],prior);
}
async function restore(){
  if(original){
    while(true){
      const s=await state(),top=s.history.at(-1);
      assert.ok(!s.active);assert.deepEqual(ids(s).slice(0,original.history.length),ids(original));
      if(s.history.length===original.history.length)break;
      assert.equal(top.key,towerKey);assert.deepEqual(top.plan.origin,origin);
      const r=await chat("undo",undone);assert.equal(r[1],top.id);
    }
    assert.deepEqual((await state()).towers,original.towers);
    await restoreProjectStyle();
  }
  if(manual)await cmd("execute if block "+manual.coords+" "+manual.after+" run setblock "+manual.coords+" "+base.get(manual.point));
  for(const [coords,b] of supports.reverse())await cmd("execute if block "+coords+" "+b+" run setblock "+coords+" air");
  if(blank)compare(await survey(),blank,"Original sky plot restored");
}

try{
  original=await state();const settings=await session();
  assert.equal(settings.provider,"codex");assert.equal(settings.selection,null);
  assert.ok(!original.active && !original.pending && !original.history.at(-1)?.partial && !original.towers[towerKey]);
  day=(await client.tool("get_time_and_weather")).dayTime;
  blank=await survey();assert.ok([...blank.values()].every(b=>b===air));
  await support("9 210 86","minecraft:stone");
  await support("16 222 60","minecraft:barrier");
  await cmd("tp WorldStudio 9.5 211 86.5 0 90");
  base=await survey();
  const built=await revision("balanced","Build a painterly medieval tower with warm limestone. "+dims,base);
  checkShape(built,16);
  const intent=built.params.artisticIntent;
  assert.equal(intent.version,1);assert.equal(intent.revision,1);assert.equal(intent.approach,"painterly");
  assert.equal(intent.palette,"warm_limestone");assert.equal(intent.texture,"balanced");
  for(const name of ["atmosphere","focalPoint"])assert.ok(typeof intent[name]==="string" && intent[name].trim().length);
  assert.deepEqual(intent.regions,{walls:"warm_limestone",trim:"existing",roof:"existing"});
  await photos("balanced",["near","medium","far"]);

  // Simulate a hand edit where the upcoming material pass actually wants to
  // repaint the wall. Prefer the back elevation so the comparison stays legible.
  const forecast=predict({...built.params,artisticIntent:{...intent,revision:2,texture:"quiet"}});
  const candidates=changed(built.live,forecast).filter(k=>built.live.get(k)!==air && forecast.get(k)!==air);
  assert.ok(candidates.length,"Quiet finish must change existing stone");
  const point=candidates.find(k=>Number(k.split(",")[2])>origin.z)??candidates[0];
  const old=built.live.get(point),after="minecraft:cut_copper",coords=point.replaceAll(","," ");
  await cmd("execute if block "+coords+" "+old+" run setblock "+coords+" "+after);
  manual={point,old,after,coords};report.manual={...manual,intended:forecast.get(point),method:"Conditional setblock simulating a builder"};
  const start=new Map(built.live).set(point,after);compare(await survey(),start,"Simulated manual edit");
  const quiet=await revision("quiet","Make the walls of this tower quieter. Keep the warm limestone, geometry, copper roof and my hand-placed block.",start);
  checkShape(quiet,16);
  const soft=quiet.params.artisticIntent;
  assert.equal(soft.texture,"quiet");assert.equal(soft.revision,2);
  for(const k of ["version","approach","palette","atmosphere","focalPoint"])assert.equal(soft[k],intent[k],k);
  assert.deepEqual(soft.regions,intent.regions);
  for(const k of changed(start,quiet.live)){
    assert.notEqual(start.get(k),air);assert.notEqual(quiet.live.get(k),air);
    assert.ok(Number(k.split(",")[1])<origin.y+16,"Quiet finish should change wall masonry only");
  }
  const beforeMetrics=wallMetrics(start),afterMetrics=wallMetrics(quiet.live);
  assert.equal(afterMetrics.occupied,beforeMetrics.occupied);
  assert.ok(afterMetrics.accents<beforeMetrics.accents,"Quiet walls should have more of the dominant material");
  assert.ok(afterMetrics.transitions<beforeMetrics.transitions,"Quiet walls should have fewer adjacent material changes");
  report.wallMetrics={balanced:beforeMetrics,quiet:afterMetrics};
  const artReply=await chat("art direction",/art v2: quiet warm limestone\./i);
  assert.ok(artReply.input.includes(soft.atmosphere) && artReply.input.includes(soft.focalPoint),"Saved mood and focal point should be visible in chat");
  report.phase="save project style";
  const priorStyles=original.projectStyles??[];
  savedStyle={source:towerKey,revision:(original.lastProjectStyleRevision??priorStyles.at(-1)?.revision??0)+1,intent:soft};
  const preSaveHistory=ids(await state());
  await chat("save this as the project style",/^Project style v\d+ saved from /);
  const saved=await state();
  assert.deepEqual(saved.projectStyles,[...priorStyles,savedStyle],"Save a copied snapshot of the quiet art direction");
  assert.deepEqual(ids(saved),preSaveHistory,"Saving a style leaves world undo history intact");
  const styleReply=await chat("project style",/^Project style v\d+ from /);
  assert.ok(styleReply.input.includes("v"+savedStyle.revision+" from "+towerKey+": quiet warm limestone.") && styleReply.input.includes(soft.atmosphere));
  compare(await survey(),quiet.live,"Saving and inspecting project style leave blocks unchanged");
  report.savedProjectStyle=savedStyle;
  await photos("quiet",["near","medium","far"]);

  report.phase="visual critique";
  const history=ids(await state());
  const spectatorMedium=report.images.find(i=>i.name==="painterly-quiet-medium.png");
  const cameraNow=await client.tool("get_self");assert.equal(cameraNow.gameMode,"creative");
  for(const [i,axis] of ["x","y","z"].entries())assert.ok(Math.abs(cameraNow[axis]-camera.medium[i])<.02);
  for(const axis of ["yaw","pitch"])assert.ok(Math.abs(cameraNow[axis]-spectatorMedium[axis])<.02);
  const look="look Critique this tower from my current view. Name one visible feature and suggest one specific improvement, without changing any blocks.";
  const critique=await chat(look,/^(?!.*(?:could not finish|not support images|could not capture|please describe the tower))(?=.*(?:wall|roof|tower|silhouette|entrance|window|foundation|base|stone|limestone|copper)).{24,}$/i);
  report.critique=critique[0];
  assert.deepEqual(ids(await state()),history);compare(await survey(),quiet.live,"Read-only visual critique");
  const tall=await revision("taller","Make this same tower four blocks taller. Keep its wall finish, opening direction and roof proportions.",quiet.live);
  checkShape(tall,20);assert.deepEqual(tall.params.artisticIntent,soft,"A height revision should preserve the complete artistic intent");
  await photos("taller",["medium"]);
  await undo(tall,tall.live,quiet.live);assert.deepEqual((await state()).towers[towerKey].params,quiet.params);
  await undo(quiet,quiet.live,start);assert.deepEqual((await state()).towers[towerKey].params,built.params);
  const emptyWithHand=new Map(base).set(manual.point,manual.after);
  await undo(built,start,emptyWithHand);
  assert.deepEqual((await state()).projectStyles,[...priorStyles,savedStyle],"Saved style survives removal of its source tower");

  await cmd("tp WorldStudio 9.5 211 86.5 0 90");
  const plain=await revision("ordinary","Build a functional stone utility tower here. "+dims,emptyWithHand);
  checkShape(plain,16);assert.ok(plain.params.artisticIntent==null,"Functional builds should use ordinary masonry");
  compare(plain.live,predict(shape),"Ordinary tower uses familiar materials");
  await undo(plain,plain.live,emptyWithHand);
  await cmd("tp WorldStudio 9.5 211 86.5 0 90");
  const matched=await revision("project-match","Build a new tower here matching the saved project style. "+dims,emptyWithHand);
  checkShape(matched,16);
  assert.deepEqual(matched.params.artisticIntent,{...soft,revision:1,styleSource:"project",styleSourceRevision:savedStyle.revision});
  compare(matched.live,quiet.live,"Explicit project match recreates the quiet walls and preserves the builder's copper");
  report.phase="restore project style";
  const beforeRestore=await state();
  await restoreProjectStyle();
  const afterRestore=await state();
  assert.deepEqual(afterRestore.towers,beforeRestore.towers,"Restoring a project style leaves registered objects alone");
  assert.deepEqual(afterRestore.bridges,beforeRestore.bridges);
  assert.deepEqual(afterRestore.history,beforeRestore.history,"Restoring a style preserves the object's undo");
  compare(await survey(),matched.live,"Restoring a project style preserves the matched tower and manual copper");
  report.restoredStyleWithTower={tower:towerKey,artRevision:matched.params.artisticIntent.revision,surveyed:matched.live.size,historyEntries:afterRestore.history.length};
  await undo(matched,matched.live,emptyWithHand);
  compare(await survey(),emptyWithHand,"Copper remains until final fixture cleanup");
  report.projectStyleRestored=true;
}catch(error){report.failure=String(error);throw error;}
finally{
  report.lastPhase=report.phase;report.phase="cleanup";
  try{await restore();report.restored=true;}
  catch(error){report.cleanupFailure=String(error);throw error;}
  finally{
    try{
      if(day!==undefined)await client.tool("set_time",{time:day});
      await cmd("tp WorldStudio "+[self.x,self.y,self.z,self.yaw,self.pitch].join(" "));
    }catch(error){report.cleanupFailure??=String(error);throw error;}
    finally{report.phase=report.failure || report.cleanupFailure?"failed":"passed";await receipt(directory,report);await client.close();}
  }
}
