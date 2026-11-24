import {readFile,writeFile,mkdir} from "node:fs/promises";
import {connect} from "./client.mjs";

const [name, json = "{}", action = "run"] = process.argv.slice(2);
if (!["sample","road","capture"].includes(name) || !["run","save","skill"].includes(action))
  throw Error("Usage: node experiments/run.mjs sample|road|capture '<JSON args>' [run|save|skill]");
const args = JSON.parse(json);
const client = await connect();
try {
  if (name === "capture") {
    if (!/^[a-z0-9-]+$/.test(args.label)) throw Error("Supply a short camera label");
    const screen = await client.tool("get_screen");
    if (!screen.inWorld || screen.lastWorldId !== args.worldId || args.worldId!=="sp:WorldStudioLab")
      throw Error("Wrong capture world");
    const image = await client.tool("screenshot");
    if (!Buffer.isBuffer(image) || image.subarray(1,4).toString()!=="PNG") throw Error("Expected a PNG");
    const dir = new URL("../screenshots/",import.meta.url);
    await mkdir(dir,{recursive:true});
    await writeFile(new URL(args.label+".png",dir),image,{flag:"wx"});
    console.log(args.label, image.readUInt32BE(16), image.readUInt32BE(20));
  } else {
    const code = await readFile(new URL(name+".js",import.meta.url),"utf8");
    if (action === "save") {
      const screen = await client.tool("get_screen");
      if (!screen.inWorld || screen.lastWorldId !== args.worldId || args.worldId!=="sp:WorldStudioLab") throw Error("Wrong skill world");
      console.log(await client.tool("save_skill",{name:"studio_"+name,description:"Studio disposable-world experiment, reads mc.args",code}));
    } else {
      const r = action === "run"
        ? await client.tool("run_script",{code,args,timeoutSeconds:300})
        : await client.tool("run_skill",{name:"studio_"+name,args,timeoutSeconds:300});
      console.log(r);
    }
  }
} finally {
  await client.close();
}
