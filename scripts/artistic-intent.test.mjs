import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {artisticGuidance} from "./studio-planner.mjs";
import {withArtisticIntent,isArtNoteOnly,emptyArtDecision} from "./artistic-intent.mjs";
import {StudioState} from "./studio-state.mjs";
import {painterlyPalettes,painterlyMaterials} from "../packages/geometry/painterly-materials.ts";

const plain={height:18};
const first=withArtisticIntent(plain,{artPalette:"warm_limestone"},"tower");
const quiet=withArtisticIntent(first,{artTexture:"quiet"},"tower");

test("intent belongs to a single building, including when a player explicitly borrows its style",()=>{
  assert.equal(withArtisticIntent(plain,emptyArtDecision,"tower"),plain);
  assert.equal(first.artisticIntent.revision,1);
  assert.deepEqual(quiet.artisticIntent.regions,first.artisticIntent.regions);
  assert.equal(quiet.artisticIntent.revision,2);
  assert.equal(withArtisticIntent(quiet,{height:22},"tower"),quiet);
  assert.equal(withArtisticIntent(quiet,{artTexture:"quiet"},"tower"),quiet);
  const bridge=withArtisticIntent({}, {artStyleSource:"tower-1"}, "bridge", quiet.artisticIntent).artisticIntent;
  assert.equal(bridge.styleSource,"tower-1");
  assert.equal(bridge.revision,1);
  assert.equal(bridge.texture,"quiet");
  assert.equal(bridge.regions.masonry,"warm_limestone");
  assert.equal(bridge.regions.walls,undefined);
  assert.notEqual(bridge.focalPoint,quiet.artisticIntent.focalPoint);
  assert.throws(()=>withArtisticIntent(plain,{artStyleSource:"missing"},"tower"),/registered/);
  assert.throws(()=>withArtisticIntent(plain,{artPalette:"air"},"tower"),/Unsupported/);
  assert.throws(()=>withArtisticIntent(first,{artAtmosphere:"a".repeat(120)},"tower"),/short/);
});

test("saved project style snapshots survive reopen, remain opt-in and restore independently of objects",t=>{
  const dir=mkdtempSync(join(tmpdir(),"studio-project-art-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const store=new StudioState(dir);
  store.data.towers.east={params:first};
  store.saveProjectStyle("east");
  store.data.towers.east.params=quiet;
  assert.equal(store.projectStyle.intent.texture,"balanced");
  store.saveProjectStyle("east");
  const resumed=new StudioState(dir);
  const {intent,revision}=resumed.projectStyle;
  assert.equal(revision,2);
  assert.equal(withArtisticIntent(plain,emptyArtDecision,"tower"),plain);
  const copy=withArtisticIntent(plain,{artStyleSource:"project"},"tower",intent,revision);
  assert.equal(copy.artisticIntent.styleSourceRevision,2);
  assert.equal(copy.artisticIntent.texture,"quiet");
  assert.equal(resumed.restoreProjectStyle().intent.texture,"balanced");
  assert.equal(resumed.data.towers.east.params.artisticIntent.texture,"quiet");
  assert.equal(copy.artisticIntent.texture,"quiet");
  assert.equal(resumed.restoreProjectStyle(),undefined);
  assert.throws(()=>resumed.saveProjectStyle("unknown"),/Aim at/);
  assert.equal(new StudioState(dir).saveProjectStyle("east").revision,3);
});

test("a descriptive art revision survives reopen and can be undone without writing a block",t=>{
  const dir=mkdtempSync(join(tmpdir(),"studio-art-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const store=new StudioState(dir);
  const origin={x:12,y:34,z:56}, before={origin,params:first,exclude:[]};
  const next=withArtisticIntent(first,{artFocalPoint:"the eastern gate"},"tower");
  const plan={previous:first,next,origin,excluded:[],runs:[],count:0};
  assert.ok(isArtNoteOnly(plan));
  assert.equal(isArtNoteOnly({...plan,next:quiet}),false);
  assert.equal(isArtNoteOnly({...plan,next:{...next,height:25}}),false);
  store.data.towers.east=before;
  store.begin("apply",{key:"east",id:"focus",before,plan,artNoteOnly:true});
  store.finish({conflicts:[]});
  const resumed=new StudioState(dir);
  assert.deepEqual(resumed.data.towers.east.params,next);
  const entry=resumed.data.history.at(-1);
  assert.deepEqual(entry.applied,[]);
  resumed.begin("undo",entry);resumed.finish(null);
  assert.deepEqual(resumed.data.towers.east.params,next);
  resumed.begin("undo",entry);resumed.finish({conflicts:[]});
  assert.deepEqual(new StudioState(dir).data.towers.east,before);
});

test("route portable art knowledge for a selected styled build and attach critique guidance read-only",()=>{
  assert.deepEqual(artisticGuidance({request:"Make the tower taller"}),[]);
  const request="Make the tower taller";
  const towers={east:{params:first}};
  assert.deepEqual(artisticGuidance({request,towers,site:{selected:"west"}}),[]);
  assert.ok(artisticGuidance({request,towers,site:{selected:"east"}}).length>0);
  const notes=artisticGuidance({request:"critique the warm architectural material",observeOnly:true});
  assert.ok(notes.some(note=>note.startsWith("# Critique and continuity")));
  assert.ok(notes.length<=3);
});

test("every shipped palette is executable and its side-face ramp rises in measured vanilla lightness",()=>{
  const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
  const report=read("../docs/painterly-palette-26.3.json");
  const schema=read("./tower-decision.schema.json");
  assert.deepEqual(new Set(schema.properties.artPalette.enum),new Set([null,...Object.keys(painterlyPalettes)]));
  assert.deepEqual(new Set(Object.keys(report.blocks)),new Set(painterlyMaterials));
  for(const palette of Object.values(painterlyPalettes)) {
    const levels=["deepShadow","shadow","midtone","base","light"].map(role=>report.textures[report.blocks[palette[role]].north].meanOKLab[0]);
    for(let i=1;i<levels.length;i++)assert.ok(levels[i]>levels[i-1],palette.base+" "+levels);
  }
});
