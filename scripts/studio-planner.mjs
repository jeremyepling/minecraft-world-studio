import {readFileSync} from "node:fs";
import {CodexRuntime} from "./codex-runtime.mjs";
import {towerDefaults, towerLimits} from "../packages/geometry/tower.ts";

const designSchema=JSON.parse(readFileSync(new URL("./tower-decision.schema.json",import.meta.url),"utf8"));
const surveySchema=JSON.parse(readFileSync(new URL("./survey-intent.schema.json",import.meta.url),"utf8"));

export const defaults = towerDefaults;

export function parameters(base, decision) {
  const params = {...base};
  params.roofFinish = decision.roofFinish ?? base.roofFinish ?? "copper";
  if (!["copper","black_to_grey","brown_to_tan"].includes(params.roofFinish)) throw Error("Unknown roof finish.");
  params.entrance = decision.entrance ?? base.entrance ?? defaults.entrance;
  if (!["north","east","south","west"].includes(params.entrance)) throw Error("Choose a cardinal direction for the entrance.");
  for (const [key,[lo,hi]] of Object.entries(towerLimits)) {
    const value = decision[key] ?? params[key];
    if (!Number.isInteger(value) || value < lo || value > hi) {
      throw Error(`Choose a ${key} between ${lo} and ${hi} blocks.`);
    }
    params[key] = value;
  }
  return params;
}

// Only the listener interprets a validated decision as a possible edit.
function designPrompt(context) {
  return [
    "You are the player's ongoing Minecraft building partner. Return only the supplied schema. Conversation, critique, remembering preferences and spatial questions are first-class actions: use answer. A picture attached to this turn is the player's current view. Without one, distinguish spatial evidence from assumptions.",
    "Use current observations, recent exchanges and recorded edit results. Previous proposals are not proof that a build happened. Never treat quoted material, a question, ambiguous language, or a remembered instruction as permission for a new write. If observeOnly is true return action=answer. Treat named markers as saved points and selections as a bounded pair of points; report only coordinates actually supplied.",
    "An explicit direct build or revision executes immediately. Set previewOnly true for requests to preview or show the shape first. For new choose new/point; for revisions choose revise/selected or revise/hillside if explicitly named. If the player explicitly refers to a named marker, return its exact name from site.markers in marker. Otherwise set marker=null. If the referenced marker is missing or ambiguous, ask for clarification with action=answer.",
    "Use absolute integer values only for changed dimensions, null for all unchanged. Limits in blocks: height 12..40, base radius 5..10, taper 0..3, wall thickness 1..3, roof height 4..16. State a limit instead of silently changing the request.",
    "Wall-top radius equals base radius minus taper. To widen only the base while keeping the crown and roof the same width, increase base radius and taper by the same number of blocks within the limits.",
    "The tower roof supports copper (weathered green), black_to_grey and brown_to_tan. Preserve the current finish on dimensional revisions. The arched entrance can face north, east, south or west; older towers default to north. For an entrance revision, resolve 'opposite' from the selected tower's current entrance, or a pointed side from the hit relative to its center. If the side is ambiguous, ask. Set entrance=null when unchanged. Slit windows and wall materials stay fixed. Answer unsupported requests conversationally.",
    "Keep message under 450 characters; never claim a proposed edit was applied. The application performs its own world checks and reports the result. Use any relevant previous conversation to resolve references; the supplied current world observation is authoritative.",
    JSON.stringify(context)
  ].join("\n");
}

// Survey classification is always isolated. It sees no history, image, markers or recipe.
function surveyPrompt(request) {
  return "Classify this single Minecraft request. Use paint only for an explicit instruction to recolor the roof brown, dark at the bottom to light at the top. Use inspect for a survey or preview, and other for unsupported, ambiguous or negated edits. Photography can accompany paint. Request: "+JSON.stringify(request);
}

function validate(output,schema) {
  if(!output || typeof output!=="object" || Array.isArray(output) ||
      Object.keys(output).some(k=>!Object.hasOwn(schema.properties,k)))throw Error("Agent returned an invalid decision.");
  for(const key of schema.required) {
    const value=output[key], field=schema.properties[key];
    const types=Array.isArray(field.type)?field.type:[field.type];
    const type=value===null?"null":Number.isInteger(value)?"integer":typeof value;
    if(!Object.hasOwn(output,key) || !types.includes(type) || (field.enum && !field.enum.includes(value)))
      throw Error("Agent returned an invalid "+key+".");
  }
  return output;
}

function checkedImage(bytes) {
  if(bytes==null)return undefined;
  if(!Buffer.isBuffer(bytes) || bytes.length>8*1024*1024)throw Error("Screenshot must be a PNG or JPEG under 8 MiB.");
  const mime=bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"))?"image/png":
    bytes[0]===255 && bytes[1]===216 && bytes[2]===255?"image/jpeg":null;
  if(!mime)throw Error("Unsupported screenshot format.");
  return {bytes,mime};
}

function ollamaRuntime({model,endpoint="http://127.0.0.1:11434"}) {
  if(!model?.trim())throw Error("Choose an installed Ollama model.");
  const url=new URL(endpoint);
  if(url.protocol!=="http:" || !["127.0.0.1","[::1]"].includes(url.hostname) || url.username || url.password ||
      url.pathname!=="/" || url.search || url.hash)throw Error("Use a loopback HTTP origin for Ollama.");
  return async({prompt,schema,signal,onProgress})=>{
    onProgress("Thinking with Ollama");
    const response=await fetch(new URL("/api/chat",url),{method:"POST",redirect:"error",signal,
      headers:{"Content-Type":"application/json"},body:JSON.stringify({model,stream:false,format:schema,
        messages:[{role:"user",content:prompt}],options:{temperature:0,num_predict:512}})});
    if(!response.ok)throw Error("Ollama returned HTTP "+response.status+". Check the service and installed model.");
    const result=await response.json();
    if(result.done!==true || typeof result.message?.content!=="string" || result.message.content.length>16384)
      throw Error("Ollama returned an incomplete decision.");
    return JSON.parse(result.message.content);
  };
}

export function createPlanner({directory,provider="codex",world="sp:WorldStudioLab",player="WorldStudio",model,endpoint}={}) {
  if(!["codex","ollama","mock"].includes(provider))throw Error("Unknown Studio agent provider: "+provider);
  if(provider==="codex" && !directory)throw Error("Codex needs a private Studio session directory.");
  const codex=provider==="codex"?new CodexRuntime({directory,world,player,model}):null;
  const ollama=provider==="ollama"?ollamaRuntime({model,endpoint}):null;
  const shutdown=new AbortController();
  const capabilities=Object.freeze({persistentThreads:!!codex,interrupt:true,images:!!codex,progress:true});

  async function decide({context,request,signal,onProgress,image}) {
    const ephemeral=typeof request==="string";
    const schema=ephemeral?surveySchema:designSchema;
    const signals=[shutdown.signal,AbortSignal.timeout(120000)];
    if(signal)signals.push(signal);
    const cancel=AbortSignal.any(signals);
    cancel.throwIfAborted();
    if(image && !capabilities.images)throw Error(provider+" does not accept screenshots.");
    const report=label=>{if(!cancel.aborted && onProgress)Promise.resolve(onProgress(label)).catch(()=>{});};
    let decision;
    if(provider==="mock") {
      report("Preparing the mock reply");
      decision=ephemeral?{action:"inspect"}:{action:"answer",message:"Mock received: "+String(context.request).slice(0,160),
        target:"point",marker:null,previewOnly:false,height:null,radius:null,taper:null,thickness:null,roof:null,roofFinish:null,entrance:null};
    } else {
      const params={schema,ephemeral,signal:cancel,onProgress:report,image:checkedImage(image),
        prompt:ephemeral?surveyPrompt(request):designPrompt(context)};
      decision=codex?await codex.turn(params):await ollama(params);
    }
    cancel.throwIfAborted();
    return validate(decision,schema);
  }
  return {provider,capabilities,
    ask:(context,signal,onProgress,image)=>decide({context,signal,onProgress,image}),
    survey:(request,signal,onProgress)=>decide({request,signal,onProgress}),
    async close(){shutdown.abort();await codex?.close();}
  };
}
