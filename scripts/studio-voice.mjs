import {spawn,execFile} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {mkdir,readFile,rename,rm,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createInterface} from "node:readline";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const run=promisify(execFile);
const sources=["WindowsAudio.cs","WindowsVoiceHost.cs"].map(name=>fileURLToPath(new URL("./voice/"+name,import.meta.url)));
const defaults={voice:false,spoken:false,inputProvider:"windows",outputProvider:"windows",key:"F8",culture:"",voiceName:""};

function cleanConfig(data) {
  if(!data || Array.isArray(data) || typeof data!=="object") throw Error("Expected a voice configuration object.");
  const cfg={...defaults,...data};
  for(const k of ["voice","spoken"]) if(typeof cfg[k]!=="boolean") throw Error(k+" must be true or false.");
  for(const k of ["inputProvider","outputProvider"]) if(!["windows","off"].includes(cfg[k])) throw Error("Unknown "+k+". Use windows or off.");
  if(typeof cfg.key!=="string" || !/^F(?:[1-9]|1\d|2[0-4])$/.test(cfg.key)) throw Error("Use a function key F1 through F24.");
  if(typeof cfg.culture!=="string" || !/^(?:[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*)?$/.test(cfg.culture)) throw Error("Invalid Windows speech culture.");
  if(typeof cfg.voiceName!=="string" || cfg.voiceName.length>100 || /[\u0000-\u001f]/.test(cfg.voiceName)) throw Error("Invalid Windows voice name.");
  return cfg;
}

export async function compileVoiceHost(directory) {
  if(process.platform!=="win32") throw Error("The installed speech provider requires Windows.");
  const windows=process.env.SystemRoot;
  if(!windows) throw Error("Cannot locate Windows desktop speech.");
  const compiler=join(windows,"Microsoft.NET","Framework64","v4.0.30319","csc.exe");
  const speech=join(windows,"Microsoft.NET","assembly","GAC_MSIL","System.Speech","v4.0_4.0.0.0__31bf3856ad364e35","System.Speech.dll");
  const hash=createHash("sha256");
  for(const source of sources) hash.update(await readFile(source));
  const cache=join(directory,"speech-bin");
  await mkdir(cache,{recursive:true});
  const exe=join(cache,"studio-voice-"+hash.digest("hex").slice(0,20)+".exe");
  if(existsSync(exe)) return exe;
  const pending=join(cache,randomUUID()+".exe");
  try {
    await run(compiler,["/nologo","/optimize+","/platform:x64","/target:exe","/out:"+pending,
      "/reference:"+speech,"/reference:System.Management.dll","/reference:System.Web.Extensions.dll",...sources],{windowsHide:true,timeout:30000});
    if(!existsSync(exe)) await rename(pending,exe);
    return exe;
  } catch(e) {
    throw Error("Cannot compile Windows speech helper: "+(e.stdout||e.message).trim().slice(0,500));
  } finally {await rm(pending,{force:true});}
}

async function openHost(directory,instance,cfg,onMessage,onExit) {
  const exe=await compileVoiceHost(directory);
  const child=spawn(exe,[instance,String(111+Number(cfg.key.slice(1))),cfg.culture,cfg.voiceName],{windowsHide:true,stdio:"pipe"});
  let rejectReady,resolveReady,stderr="";
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  // stdin errors can race process exit after an external stop.
  child.stdin.on("error",()=>{});
  const lines=createInterface({input:child.stdout});
  lines.on("line",line=>{
    let msg;
    try {msg=JSON.parse(line);}catch{return;}
    if(msg.type==="ready") resolveReady(msg);else onMessage(msg);
  });
  child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-350);});
  child.once("error",e=>rejectReady(e));
  child.once("exit",(code,signal)=>{
    const detail=stderr.trim()||("Exit "+(code??signal));
    rejectReady(Error(detail));onExit(detail);
  });
  const timer=setTimeout(()=>{rejectReady(Error("Windows speech initialization timed out."));child.kill();},18000);
  try {
    const caps=await ready;
    return {caps,
      send:msg=>{if(child.stdin.writable && !child.stdin.destroyed) child.stdin.write(JSON.stringify(msg)+"\n");},
      stop:()=>{child.stdin.end();const kill=setTimeout(()=>{if(child.exitCode===null)child.kill();},1000);kill.unref();}
    };
  } catch(e){child.kill();throw e;} finally {clearTimeout(timer);}
}

// Voice is optional. Only the speech helper observes the configured PTT key.
// Its private stdio accepts a fresh lab authorization lease for each hold.
export function createVoice({directory,instanceDirectory,authorize,onText,onStatus,hostFactory=openHost}) {
  if(!directory || !instanceDirectory || typeof authorize!=="function") throw Error("Voice requires private state, the game directory and a world authorization check.");
  const file=join(directory,"voice.json");
  const status=text=>Promise.resolve().then(()=>onStatus?.(String(text).slice(0,350))).catch(()=>{});
  let config;
  try {config=cleanConfig(existsSync(file)?JSON.parse(readFileSync(file,"utf8")):{});}
  catch(e){config={...defaults};status("Voice configuration could not be loaded: "+e.message);}
  let online=false,closed=false,generation=0,inputEpoch=0,host,opening,checking=false;
  let serial=Promise.resolve();
  const allowed=()=>online && !closed;
  const input=()=>allowed() && config.voice && config.inputProvider==="windows";
  const output=()=>allowed() && config.spoken && config.outputProvider==="windows";
  function update() {
    host?.send({op:"settings",input:Boolean(input() && host.caps.recognition),output:Boolean(output() && host.caps.synthesis)});
  }
  function stopHost() {
    generation++;checking=false;
    host?.stop();host=undefined;
    opening=undefined;
  }
  async function receive(msg,which) {
    if(which!==generation || !allowed() || !host) return;
    if(msg.type==="status"){
      if(input() || output()) await status(msg.text);
      return;
    }
    if(!input() || !host.caps.recognition) return;
    const epoch=inputEpoch;
    if(msg.type==="authorize") {
      if(checking || !Number.isSafeInteger(msg.hold)) return;
      checking=true;
      try {
        let ok=false;
        try {ok=(await authorize())===true;}catch{}
        if(which===generation && epoch===inputEpoch && input()) host?.send({op:"grant",hold:msg.hold,allow:ok});
      } finally {if(which===generation) checking=false;}
    } else if(msg.type==="text" && typeof msg.text==="string") {
      const text=msg.text.replace(/[\u0000-\u001f\u007f§]/g," ").trim().slice(0,1000);
      if(!text) return;
      let ok=false;
      try {ok=(await authorize())===true;}catch{}
      if(which===generation && epoch===inputEpoch && input() && ok) await onText(text);
    }
  }
  function ensureHost() {
    if(host) return Promise.resolve(host);
    if(opening) return opening;
    const which=++generation;
    const promise=Promise.resolve().then(()=>hostFactory(directory,resolve(instanceDirectory),config,
      msg=>receive(msg,which).catch(e=>status("Voice request failed: "+e.message)),
      detail=>{
        if(which!==generation || !host) return;
        host=undefined;opening=undefined;generation++;checking=false;
        status("Voice helper stopped. Type @studio voice on or @studio spoken on to retry. "+detail);
      })).then(next=>{
        if(which!==generation || !allowed()){next.stop();throw Error("Voice session ended.");}
        host=next;return next;
      }).finally(()=>{if(opening===promise) opening=undefined;});
    opening=promise;return promise;
  }
  async function save() {
    await mkdir(directory,{recursive:true});
    const tmp=file+"."+randomUUID()+".tmp";
    try {await writeFile(tmp,JSON.stringify(config,null,2)+"\n","utf8");await rename(tmp,file);}
    finally {await rm(tmp,{force:true});}
  }
  function describe(mode) {
    const provider=mode==="voice"?config.inputProvider:config.outputProvider;
    if(provider==="off") return (mode==="voice"?"Recognition":"Synthesis")+" provider is off in voice.json.";
    if(config[mode] && allowed() && !opening && !host?.caps[mode==="voice"?"recognition":"synthesis"])
      return "Configured speech provider is unavailable. Type @studio "+mode+" on to retry.";
    if(mode==="voice") return config.voice
      ? "Push-to-talk on. Hold "+config.key+" while facing your build, speak, then release."
      : "Push-to-talk off. Type @studio voice on to enable it.";
    return config.spoken?"Spoken replies on.":"Spoken replies off. Type @studio spoken on to enable them.";
  }
  async function configure(mode,value="status") {
    if(!["voice","spoken"].includes(mode) || !["on","off","status"].includes(value)) throw Error("Use @studio "+mode+" on, off or status.");
    if(value==="status") return describe(mode);
    if(value==="on") {
      if(!allowed()) throw Error("Open the authorized lab before enabling speech.");
      const recognition=mode==="voice";
      const provider=recognition?config.inputProvider:config.outputProvider;
      if(provider==="off") throw Error((recognition?"Recognition":"Synthesis")+" provider is off in voice.json.");
      const next=await ensureHost();
      const capable=recognition?next.caps.recognition:next.caps.synthesis;
      if(!capable) {
        if(!input() && !output()) stopHost();
        const reason=recognition?next.caps.recognitionError:next.caps.synthesisError;
        throw Error((recognition?"Recognition":"Synthesis")+" unavailable. "+(reason||"Check installed Windows desktop speech language and voices."));
      }
    }
    const prior=config;
    if(mode==="voice") inputEpoch++;
    config={...config,[mode]:value==="on"};
    // Disable before writing preferences; never wait for storage to disarm input.
    if(value==="off") update();
    try {await save();}
    catch(e){if(value==="on") config=prior;update();throw e;}
    if(input() || output()) update();else stopHost();
    return describe(mode);
  }
  return {
    configure(mode,value){
      const task=serial.then(()=>configure(mode,value));serial=task.catch(()=>{});return task;
    },
    connect(){
      if(closed || online) return;
      online=true;
      if(!input() && !output()) return;
      ensureHost().then(next=>{
        update();
        if(input() && !next.caps.recognition) status("Configured Windows recognition is unavailable.");
        if(output() && !next.caps.synthesis) status("Configured Windows synthesis is unavailable.");
      }).catch(e=>{if(online && !closed)status(e.message);});
    },
    disconnect(){
      online=false;stopHost();
    },
    speak(text){
      if(output() && host?.caps.synthesis && typeof text==="string" && text.trim()) host.send({op:"speak",text:text.trim().slice(0,700)});
    },
    quiet(){host?.send({op:"quiet"});},
    close(){closed=true;online=false;stopHost();}
  };
}
