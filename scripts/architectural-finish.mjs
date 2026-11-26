export function architecturalFinish(base,d,site,origin) {
  const finish={...base};
  if(d.drips!=null)finish.drips=d.drips;
  if(!d.light)return finish;
  if(d.light==="remove"){finish.shadowSource=null;return finish;}
  const player=site.player;
  if(d.light==="player") {
    finish.shadowSource={x:player.x-origin.x,y:player.eyeY-origin.y,z:player.z-origin.z};
    return finish;
  }
  const yaw=player.yaw*Math.PI/180;
  const horizontal={overhead:[0,0],north:[0,-1],south:[0,1],east:[1,0],west:[-1,0],facing:[-Math.sin(yaw),Math.cos(yaw)]}[d.light];
  if(!horizontal)throw Error("Choose a light direction.");
  finish.shadowSource={x:(base.dx??0)/2+horizontal[0]*1024,y:1024,z:(base.dz??0)/2+horizontal[1]*1024};
  return finish;
}
