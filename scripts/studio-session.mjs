import {appendFileSync,existsSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {join} from "node:path";

const sameName=(a,b)=>a.toLowerCase()===b.toLowerCase();
export const coordinates=p=>[p.x,p.y,p.z].join(" ");
export const selectionName=s=>s ? [s.from,s.to].filter(Boolean).join(" to ") : "none";

export function regionOf(a,b) {
  const from={},to={};
  for(const axis of ["x","y","z"]) {
    from[axis]=Math.min(a[axis],b[axis]);to[axis]=Math.max(a[axis],b[axis]);
  }
  return {from,to};
}

export function inside(region,p) {
  return ["x","y","z"].every(axis=>p[axis]>=region.from[axis] && p[axis]<=region.to[axis]);
}

export class StudioSession {
  constructor(directory,scope,legacyTurns=[]) {
    this.file=join(directory,"session.json");
    this.log=join(directory,"conversation.jsonl");
    this.data=existsSync(this.file)?JSON.parse(readFileSync(this.file,"utf8")):
      {version:1,...scope,provider:"codex",markers:[],selection:null};
    if(this.data.version!==1 || Object.entries(scope).some(([key,v])=>this.data[key]!==v))
      throw Error("Studio session belongs to a different player, world or dimension.");
    this.recent=[];
    this.count=0;
    if(existsSync(this.log)) {
      const lines=readFileSync(this.log,"utf8").split("\n");
      // A partial final append cannot become the prefix of the next entry.
      if(lines.pop()) writeFileSync(this.log,lines.length?lines.join("\n")+"\n":"",{flush:true});
      for(const line of lines) this.remember(JSON.parse(line));
    } else {
      for(const t of legacyTurns) {
        if(t.request) this.record("user",t.request);
        if(t.reply) this.record("assistant",t.reply);
      }
    }
    this.save();
  }
  save() {
    writeFileSync(this.file+".tmp",JSON.stringify(this.data,null,2),{flush:true});
    renameSync(this.file+".tmp",this.file);
  }
  remember(turn) {
    this.count++;
    this.recent.push(turn);
    if(this.recent.length>16) this.recent.shift();
  }
  record(role,text) {
    const turn={at:new Date().toISOString(),role,text:String(text).slice(0,2000)};
    appendFileSync(this.log,JSON.stringify(turn)+"\n",{flush:true});
    this.remember(turn);
  }
  marker(name) {
    const found=this.data.markers.find(m=>typeof name==="string" && sameName(m.name,name.trim()));
    if(!found) throw Error("Unknown marker. Type @studio markers.");
    return found;
  }
  mark(name,hit,move=false) {
    name=name.trim();
    if(!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,39}$/u.test(name) || /\s+to\s+/i.test(name) || sameName(name,"clear"))
      throw Error("Use a marker name up to 40 letters, numbers, spaces, dashes or underscores. Reserve 'clear' and ' to ' for selections.");
    if(!hit || ![hit.x,hit.y,hit.z].every(Number.isSafeInteger)) throw Error("Aim at a block within 96 blocks to mark it.");
    const existing=this.data.markers.find(m=>sameName(m.name,name));
    if(existing && !move) throw Error("That marker already exists. Use @studio move marker "+existing.name+".");
    if(!existing && move) throw Error("Unknown marker. Create it with @studio mark "+name+".");
    const point={name:existing?.name??name,x:hit.x,y:hit.y,z:hit.z,block:hit.id};
    if(existing) Object.assign(existing,point); else this.data.markers.push(point);
    this.save();
    return point;
  }
  forget(name) {
    const m=this.marker(name),sel=this.data.selection;
    this.data.markers=this.data.markers.filter(it=>it!==m);
    if(sel && (sel.from===m.name || sel.to===m.name)) this.data.selection=null;
    this.save();
    return m.name;
  }
  select(input) {
    if(sameName(input.trim(),"clear")) this.data.selection=null;
    else {
      const parts=input.trim().split(/\s+to\s+/i);
      if(parts.length>2) throw Error("Use @studio select FROM to TO.");
      const from=this.marker(parts[0]).name;
      this.data.selection=parts.length===2?{from,to:this.marker(parts[1]).name}:{from};
    }
    this.save();
    return this.data.selection;
  }
  region() {
    const s=this.data.selection;
    return s?.to ? regionOf(this.marker(s.from),this.marker(s.to)):null;
  }
}
