import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const length = r => r.top-r.y+1;
const rangeKey = r => r.x+","+r.z;

// An interrupted undo can split a column. Retain exactly the cells whose
// confirmed forward writes have not yet been reversed or relinquished.
function subtract(runs, removed) {
  const columns = new Map();
  for (const r of removed) {
    const key=rangeKey(r);
    if (!columns.has(key)) columns.set(key,new Set());
    for (let y=r.y;y<=r.top;y++) columns.get(key).add(y);
  }
  const keep=[];
  for (const r of runs) {
    const omit=columns.get(rangeKey(r));
    if (!omit) {keep.push(r);continue;}
    let start=r.y;
    for(let y=r.y;y<=r.top+1;y++) {
      if(y<=r.top && !omit.has(y)) continue;
      if(start<y) keep.push({...r,y:start,top:y-1});
      start=y+1;
    }
  }
  return keep;
}

export class StudioState {
  constructor(directory) {
    this.directory=directory;
    mkdirSync(directory,{recursive:true});
    this.file=join(directory,"state.json");
    this.data=existsSync(this.file) ? JSON.parse(readFileSync(this.file,"utf8")) :
      {version:1,towers:{},history:[],pending:null,selected:null,cursor:0,turns:[]};
    if(this.data.version!==1) throw Error("Unknown World Studio state version");
  }
  save() {
    writeFileSync(this.file+".tmp",JSON.stringify(this.data),{flush:true});
    renameSync(this.file+".tmp",this.file);
  }
  begin(direction,entry) {
    if(this.data.active) throw Error("An edit is already in progress.");
    this.data.active={direction,entry,receipt:"edit-"+randomUUID()+".jsonl"};
    this.data.pending=null;
    this.save();
  }
  receipt(record) {
    appendFileSync(join(this.directory,this.data.active.receipt),JSON.stringify(record)+"\n",{flush:true});
  }
  callbacks(signal) {
    return {signal,onBeforeRun:async run=>this.receipt({before:run}),
      onProgress:async ({run,changed})=>this.receipt({done:run,changed})};
  }
  finish(result) {
    const {entry,direction,receipt}=this.data.active;
    const file=join(this.directory,receipt);
    let uncertain=null;
    const confirmed=[];
    if(existsSync(file)) {
      for(const line of readFileSync(file,"utf8").split("\n").slice(0,-1)) {
        const r=JSON.parse(line);
        if(r.before) uncertain=r.before;
        if(r.done) {
          if(r.changed) confirmed.push(r.done);
          uncertain=null;
        }
      }
    }
    const omitted=[...(result?.conflicts??[]),...(uncertain?[uncertain]:[])];
    if(direction==="apply") {
      if(confirmed.length) {
        this.data.history.push({...entry,applied:confirmed,partial:!result});
        this.data.selected=entry.key;
      }
      if(result && confirmed.length) {
        this.data.towers[entry.key]={origin:entry.plan.origin,params:entry.plan.next,
          exclude:[...entry.plan.excluded,...omitted]};
      }
    } else {
      const last=this.data.history.at(-1);
      if(last?.id!==entry.id) throw Error("Undo history does not match the journal.");
      const remaining=result ? [] : subtract(last.applied,[...confirmed,...omitted]);
      if(remaining.length) {
        last.applied=remaining;
        last.partial=true;
        last.undoExcluded=[...(last.undoExcluded??[]),...omitted];
      } else {
        this.data.history.pop();
        if(entry.before) this.data.towers[entry.key]={...entry.before,
          exclude:[...entry.before.exclude,...(last.undoExcluded??[]),...omitted]};
        else delete this.data.towers[entry.key];
        this.data.selected=this.data.towers[entry.key] ? entry.key : null;
      }
    }
    if(uncertain) {
      (this.data.uncertainSpans??=[]).push(uncertain);
      this.data.lastUncertain={id:entry.id,run:uncertain};
    }
    delete this.data.active;
    this.save();
    if(existsSync(file)) unlinkSync(file);
    return {written:confirmed.reduce((n,r)=>n+length(r),0),uncertain};
  }
}
