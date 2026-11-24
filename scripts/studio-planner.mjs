import { spawn } from "node:child_process";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const schema = fileURLToPath(new URL("./tower-decision.schema.json", import.meta.url));
export const defaults = {height:30,radius:7,taper:2,thickness:2,roof:9};
const limits = {height:[12,40],radius:[5,10],taper:[0,3],thickness:[1,3],roof:[4,16]};

export function parameters(base, decision) {
  const params = {...base};
  for (const [key,[lo,hi]] of Object.entries(limits)) {
    const value = decision[key] ?? params[key];
    if (!Number.isInteger(value) || value < lo || value > hi) {
      throw Error(`Choose a ${key} between ${lo} and ${hi} blocks.`);
    }
    params[key] = value;
  }
  return params;
}

// The agent sees the player's site survey and previous design as data. Only
// the listener holds the bridge; model output is a small validated design.
export async function askCodex(context, signal) {
  const cwd = await mkdtemp(join(tmpdir(),"worldstudio-planner-"));
  const timeout = AbortSignal.timeout(120000);
  const cancel = AbortSignal.any([signal, timeout]);
  const args = ["exec","--ephemeral","--ignore-user-config","--skip-git-repo-check","--sandbox","read-only",
    "--disable","shell_tool","--disable","unified_exec","--disable","apps","--disable","plugins",
    "-c",'web_search="disabled"',"-c",'model_reasoning_effort="low"',"--output-schema",schema,"--json","-"];
  const prompt = [
    "You are a Minecraft building partner in a one-player watchtower studio. Answer ONLY in the supplied schema.",
    "Use the supplied survey. Make no tool calls. The application alone can preview and edit after explicit player approval.",
    "Answer questions conversationally. Choose answer (no proposal) if the request is unsupported, unclear, or outside this lab.",
    "For a proposed new tower choose new/point. For revisions use revise/selected for the pointed or recently selected tower, or revise/hillside if explicitly named.",
    "Return absolute integer values for changed parameters; use null for every unchanged field. Apply relative changes to the current target's saved parameters.",
    "Limits (blocks): wall height 12..40, base radius 5..10, taper 0..3, thickness 1..3, roof height 4..16. State constraints instead of silently changing a request.",
    "Supported shape: hollow tapered stone-brick wall with fixed north doorway, slit windows, conical weathered copper roof. Material/door edits aren't implemented.",
    "Keep message under 180 characters: describe the proposed change or answer the question. Never claim an edit has been applied.",
    JSON.stringify(context),
  ].join("\n");
  try {
    const child = spawn("codex",args,{cwd,signal:cancel,windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let answer, completed=false, diagnostic="";
    const done = new Promise((resolve,reject)=>{
      child.once("error",reject);
      child.once("close",code=>code===0 && completed ? resolve() :
        reject(Error("Codex could not finish the design turn. " + diagnostic.slice(-350))));
    });
    child.stderr.on("data",chunk=>{ diagnostic=(diagnostic+chunk.toString()).slice(-1200); });
    child.stdin.on("error",()=>{});
    const lines = createInterface({input:child.stdout});
    lines.on("line",line=>{
      try {
        const event=JSON.parse(line);
        if(event.item?.type==="agent_message" && event.type==="item.completed") answer=event.item.text;
        if(event.type==="turn.completed") completed=true;
        if(event.type==="turn.failed") diagnostic=event.error?.message ?? diagnostic;
      } catch { /* stdout may include CLI diagnostics */ }
    });
    child.stdin.end(prompt);
    await done;
    const decision=JSON.parse(answer);
    if (!["answer","new","revise"].includes(decision.action) || !["point","selected","hillside"].includes(decision.target) ||
        typeof decision.message !== "string") throw Error("Codex returned an invalid design.");
    return decision;
  } finally {
    await rmdir(cwd).catch(()=>{});
  }
}
