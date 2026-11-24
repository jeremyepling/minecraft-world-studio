import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const local = new URL("../local/", import.meta.url);
const config = JSON.parse(readFileSync(new URL("instance/config/mcpfabric.config.json", local), "utf8").replace(/^\uFEFF/, ""));
if (config.host !== "127.0.0.1" || config.port !== 25639 || config.requireAuth !== true ||
    config.writeDiscoveryFile !== false || !config.token?.trim()) {
  throw new Error("Expected the authenticated, private WorldStudioLab bridge on port 25639.");
}
const profile = process.argv[2] ?? "studio";
const profiles = { studio: "build,player,operator,agent,script,events", all: "all", build: "build" };
if (!Object.hasOwn(profiles, profile)) throw new Error("Unknown tool profile");
Object.assign(process.env, {
  MCPFABRIC_URL: "http://127.0.0.1:25639",
  MCPFABRIC_TOKEN: config.token,
  MCPFABRIC_TRANSPORT: "stdio",
  MCPFABRIC_CHANNEL: "false",
  MCPFABRIC_AGENT: "true",
  MCPFABRIC_SCRIPTS: "true",
  MCPFABRIC_TIMEOUT_MS: "75000",
  MCPFABRIC_DATA_DIR: fileURLToPath(new URL("agent/", local)),
  MCPFABRIC_TOOLSETS: profiles[profile],
});
delete process.env.MCPFABRIC_WORLD;
await import(new URL("server/server/index.js", local));
