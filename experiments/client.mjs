import {fileURLToPath} from "node:url";
import {Client} from "../local/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import {StdioClientTransport} from "../local/server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

// Use the pinned Studio bridge and its instance-specific credentials.
export async function connect() {
  const client = new Client({name:"world-studio-evaluation",version:"1"});
  await client.connect(new StdioClientTransport({
    command:process.execPath, args:[fileURLToPath(new URL("../scripts/bridge.mjs",import.meta.url)), "all"],
    stderr:"inherit"
  }));
  return {
    close:() => client.close(),
    async tool(name,args = {}) {
      const result = await client.callTool({name,arguments:args},undefined,{timeout:330000});
      const text = result.content.find(c => c.type === "text")?.text;
      if (result.isError) throw Error(name + ": " + text);
      const image = result.content.find(c => c.type === "image");
      if (image) return Buffer.from(image.data,"base64");
      const data = result.structuredContent;
      return data?.untrusted ? data.data : data ?? text;
    }
  };
}
