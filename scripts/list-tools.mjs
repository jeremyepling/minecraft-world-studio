import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "../local/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../local/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const file = name => fileURLToPath(new URL(name, import.meta.url));
for (const profile of ["all", "build", "studio"]) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [file("./bridge.mjs"), profile], stderr: "pipe"
  });
  const client = new Client({name:"studio-inventory",version:"1"});
  try {
    await client.connect(transport);
    let cursor;
    const tools = [];
    do {
      const page = await client.listTools({cursor});
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    const output = profile === "all" ? tools : tools.map(t => t.name);
    await writeFile(file("../docs/tools-" + profile + ".json"), JSON.stringify(output, null, 2) + "\n");
    console.log(profile, tools.length);
    if (profile === "all") {
      const r = await client.callTool({name:"run_script",arguments:{code:"return {area:mc.args.radius ** 2, engine:typeof BigInt}",args:{radius:7}}});
      console.log("script smoke", r.content);
      const s = await client.callTool({name:"get_status",arguments:{}});
      console.log("get_status", s.isError ? s.content[0].text : "connected");
    }
  } finally {
    await client.close();
  }
}
