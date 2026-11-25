import {gzipSync} from "node:zlib";

// The Fabric 26.3 WorldEdit export fixture uses Sponge v3, data version 5023.
// Studio designs contain ordinary block states, with no entities or block entities.
function short(n) {
  const b=Buffer.alloc(2);
  b.writeInt16BE(n);
  return b;
}
function int(n) {
  const b=Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
}
function tag(type,name,data) {
  const key=Buffer.from(name,"utf8");
  return Buffer.concat([Buffer.from([type]),short(key.length),key,data]);
}
const compound=(name,children)=>tag(10,name,Buffer.concat([...children,Buffer.from([0])]));
const vector=(name,values)=>tag(11,name,Buffer.concat([int(values.length),...values.map(int)]));

export function exportSchematic(runs,origin) {
  const axes=["x","y","z"];
  if(!axes.every(k=>Number.isInteger(origin?.[k]) && origin[k]>=-2147483648 && origin[k]<=2147483647))
    throw Error("A schematic needs an integer origin.");
  if(!runs.length)throw Error("A schematic needs at least one block.");
  const from={x:Infinity,y:Infinity,z:Infinity},to={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const {x,y,z,top,after} of runs) {
    if(![x,y,z,top].every(Number.isSafeInteger) || top<y ||
       typeof after!=="string" || !/^minecraft:[a-z0-9_]+$/.test(after))throw Error("Invalid schematic block run.");
    from.x=Math.min(from.x,x);from.y=Math.min(from.y,y);from.z=Math.min(from.z,z);
    to.x=Math.max(to.x,x);to.y=Math.max(to.y,top);to.z=Math.max(to.z,z);
  }
  const width=to.x-from.x+1,height=to.y-from.y+1,length=to.z-from.z+1;
  if(Math.max(width,height,length)>32767 || width*height*length>1000000)throw Error("Schematic exceeds Studio bounds.");
  const palette=new Map([["minecraft:air",0]]);
  const data=Buffer.alloc(width*height*length);
  for(const r of runs) {
    if(!palette.has(r.after))palette.set(r.after,palette.size);
    const id=palette.get(r.after);
    // All Studio materials fit a one-byte positive VarInt.
    if(id>=128)throw Error("Studio schematic palette exceeds 128 states.");
    for(let y=r.y;y<=r.top;y++)data[((y-from.y)*length+r.z-from.z)*width+r.x-from.x]=id;
  }
  const blocks=compound("Blocks",[
    compound("Palette",[...palette].map(([state,id])=>tag(3,state,int(id)))),
    tag(7,"Data",Buffer.concat([int(data.length),data])),
    tag(9,"BlockEntities",Buffer.concat([Buffer.from([10]),int(0)]))
  ]);
  const schematic=compound("Schematic",[
    tag(3,"Version",int(3)),tag(3,"DataVersion",int(5023)),
    compound("Metadata",[compound("WorldEdit",[vector("Origin",axes.map(k=>origin[k]))])]),
    tag(2,"Width",short(width)),tag(2,"Height",short(height)),tag(2,"Length",short(length)),
    vector("Offset",axes.map(k=>from[k]-origin[k])),blocks
  ]);
  return gzipSync(compound("",[schematic]));
}
