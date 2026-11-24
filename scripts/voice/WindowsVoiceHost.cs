using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Speech.Synthesis;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace WorldStudio.Voice
{
    internal sealed class GameWindow
    {
        private readonly string directory;
        private int cachedPid;
        private bool cachedMatch;
        private long cacheUntil;
        private readonly Stopwatch clock=Stopwatch.StartNew();
        [DllImport("user32")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32")] private static extern uint GetWindowThreadProcessId(IntPtr window, out int pid);
        [DllImport("user32")] private static extern short GetAsyncKeyState(int key);
        [DllImport("shell32", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr CommandLineToArgvW(string line,out int count);
        [DllImport("kernel32")] private static extern IntPtr LocalFree(IntPtr handle);

        internal GameWindow(string instanceDirectory) {directory=Path.GetFullPath(instanceDirectory).TrimEnd('\\');}
        internal static bool Matches(string line,string expected)
        {
            int count;
            var ptr=CommandLineToArgvW(line,out count);
            if(ptr==IntPtr.Zero) return false;
            try
            {
                var args=new string[count];
                for(int i=0;i<count;i++) args[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(ptr,i*IntPtr.Size));
                int index=Array.IndexOf(args,"--gameDir");
                return args.Contains("net.fabricmc.loader.impl.launch.knot.KnotClient") &&
                    index>=0 && index+1<count && Path.IsPathRooted(args[index+1]) &&
                    String.Equals(Path.GetFullPath(args[index+1]).TrimEnd('\\'),expected,StringComparison.OrdinalIgnoreCase);
            }
            finally {LocalFree(ptr);}
        }
        internal bool Focused()
        {
            int pid;
            var window=GetForegroundWindow();
            if(window==IntPtr.Zero || GetWindowThreadProcessId(window,out pid)==0) return false;
            if(pid==cachedPid && clock.ElapsedMilliseconds<cacheUntil) return cachedMatch;
            cachedPid=pid;
            cacheUntil=clock.ElapsedMilliseconds+2000;
            cachedMatch=false;
            try
            {
                using(var app=Process.GetProcessById(pid))
                {
                    if(app.ProcessName!="java" && app.ProcessName!="javaw") return false;
                }
                using(var query=new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId="+pid))
                using(var rows=query.Get())
                {
                    foreach(ManagementObject row in rows)
                    {
                        using(row) {var line=row["CommandLine"] as string;cachedMatch=line!=null && Matches(line,directory);}
                        break;
                    }
                }
            }
            catch(ArgumentException) {} // Window closed between the two checks.
            catch(ManagementException) {}
            catch(UnauthorizedAccessException) {}
            return cachedMatch;
        }
        // While a hold is live, avoid WMI lookups that could delay device release.
        internal bool StillFocused()
        {
            int pid;
            return cachedMatch && GetWindowThreadProcessId(GetForegroundWindow(),out pid)!=0 && pid==cachedPid;
        }
        internal bool KeyDown(int key) {return (GetAsyncKeyState(key)&0x8000)!=0;}
    }

    internal sealed class Host : IDisposable
    {
        private readonly GameWindow window;
        private readonly int key;
        private readonly string culture;
        private readonly string voice;
        private readonly Stopwatch clock=Stopwatch.StartNew();
        private readonly ConcurrentQueue<Dictionary<string,object>> inbox=new ConcurrentQueue<Dictionary<string,object>>();
        private readonly JavaScriptSerializer json=new JavaScriptSerializer();
        private bool input,output,armed,held,decoding;
        private int hold,epoch;
        private long leaseUntil,nextCheck,start;
        private Microphone microphone;
        private SpeechSynthesizer synth;
        private volatile bool eof;

        private Host(string path,int key,string culture,string voice)
        {window=new GameWindow(path); this.key=key; this.culture=culture; this.voice=voice;}
        private void Emit(string kind,string text="")
        {
            Console.WriteLine(json.Serialize(new {type=kind,text=text,hold=hold}));
            Console.Out.Flush();
        }
        private void Drop()
        {
            epoch++;held=false;armed=false;
            if(microphone!=null){microphone.Dispose();microphone=null;}
        }
        private void HaltSpeech() {if(synth!=null) synth.SpeakAsyncCancelAll();}
        private void Release()
        {
            held=false;
            if(microphone==null) return;
            byte[] pcm;
            try {pcm=microphone.Stop();}
            finally {microphone.Dispose();microphone=null;}
            Emit("status","Transcribing.");
            int token=epoch;
            decoding=true;
            ThreadPool.QueueUserWorkItem(_=>{
                string text="",error="";
                try {text=LocalSpeech.Transcribe(pcm,culture);}
                catch(Exception ex) {error=ex.GetBaseException().Message;}
                finally {Array.Clear(pcm,0,pcm.Length);}
                inbox.Enqueue(new Dictionary<string,object>{{"op","result"},{"epoch",token},{"text",text},{"error",error}});
            });
        }
        private void Tick()
        {
            if(!input) return;
            bool focused=held ? window.StillFocused() : window.Focused();
            if(!focused) {if(held || armed) Drop();return;}
            bool down=window.KeyDown(key);
            if(!down)
            {
                if(held) Release();
                armed=true;return;
            }
            if(!held && armed && !decoding)
            {
                hold++; epoch++; held=true;armed=false;start=clock.ElapsedMilliseconds;
                leaseUntil=start+1600;nextCheck=start+500;
                Emit("authorize");
            }
            if(!held) return;
            long now=clock.ElapsedMilliseconds;
            if(now>=leaseUntil || now-start>=30000)
            {
                Drop(); Emit("status","Voice hold expired. Release the key and try again.");return;
            }
            if(now>=nextCheck)
            {
                nextCheck=now+500;Emit("authorize");
            }
        }
        private void Command(Dictionary<string,object> msg)
        {
            string op=(string)msg["op"];
            if(op=="settings")
            {
                bool wantInput=(bool)msg["input"], wantOutput=(bool)msg["output"];
                if(!wantInput) Drop();
                if(!wantOutput) HaltSpeech();
                input=wantInput;output=wantOutput;
            }
            else if(op=="grant" && held && input && Convert.ToInt32(msg["hold"])==hold)
            {
                if(!(bool)msg["allow"] || !window.StillFocused() || !window.KeyDown(key)) {Drop();return;}
                leaseUntil=clock.ElapsedMilliseconds+1200;
                if(microphone==null)
                {
                    HaltSpeech();
                    microphone=new Microphone();
                    Emit("status","Listening. Release the key to send.");
                }
            }
            else if(op=="speak" && output && !held && !decoding)
            {
                if(synth==null) synth=LocalSpeech.Synthesizer(voice);
                HaltSpeech();synth.SpeakAsync((string)msg["text"]);
            }
            else if(op=="quiet") HaltSpeech();
            else if(op=="result")
            {
                decoding=false;
                if(input && Convert.ToInt32(msg["epoch"])==epoch && window.Focused())
                {
                    string error=(string)msg["error"], text=(string)msg["text"];
                    if(error.Length!=0) Emit("status","Recognition failed: "+error);
                    else if(text.Length==0) Emit("status","No clear speech recognized. Try again.");
                    else Emit("text",text);
                }
            }
        }
        private void Run()
        {
            var reader=new Thread(()=>{
                try
                {
                    string line;
                    var parser=new JavaScriptSerializer();
                    while((line=Console.ReadLine())!=null)
                    {
                        if(line.Length>8192) break;
                        var msg=parser.Deserialize<Dictionary<string,object>>(line);
                        if(msg==null || !msg.ContainsKey("op") || (string)msg["op"]=="result") break;
                        inbox.Enqueue(msg);
                    }
                }
                catch(Exception) {}
                finally {eof=true;}
            });
            reader.IsBackground=true;reader.Start();
            bool recognition=false,synthesis=false;
            string recognitionError="",synthesisError="";
            try {using(var engine=LocalSpeech.Recognizer(culture)) recognition=true;} catch(Exception ex){recognitionError=ex.GetBaseException().Message;}
            try {using(var speaker=LocalSpeech.Synthesizer(voice)) synthesis=speaker.GetInstalledVoices().Any(v=>v.Enabled);} catch(Exception ex){synthesisError=ex.GetBaseException().Message;}
            Console.WriteLine(json.Serialize(new {type="ready",recognition=recognition,synthesis=synthesis,recognitionError=recognitionError,synthesisError=synthesisError}));
            Console.Out.Flush();
            while(!eof)
            {
                try
                {
                    Dictionary<string,object> msg;
                    while(inbox.TryDequeue(out msg)) Command(msg);
                    Tick();
                }
                catch(Exception ex) {Drop();Emit("status",ex.GetBaseException().Message);}
                Thread.Sleep(20);
            }
        }
        public void Dispose() {Drop();if(synth!=null){HaltSpeech();synth.Dispose();}}
        [STAThread]
        public static int Main(string[] args)
        {
            Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
            try
            {
                if(args.Length>=1 && args[0]=="--test")
                {
                    string path=@"C:\World Studio\local\instance";
                    const string cli="java.exe net.fabricmc.loader.impl.launch.knot.KnotClient --gameDir ";
                    if(!GameWindow.Matches(cli+"\""+path+"\"",path) || GameWindow.Matches(cli+"\""+path+"-other\"",path) ||
                       GameWindow.Matches("java.exe -jar other.jar --gameDir \""+path+"\"",path))
                        throw new Exception("Foreground identity matcher failed.");
                    var transcript=LocalSpeech.RoundTrip(args.Length>1?args[1]:"",args.Length>2?args[2]:"");
                    Console.WriteLine(new JavaScriptSerializer().Serialize(new {transcript=transcript,identity=true}));
                    return transcript.Length==0?1:0;
                }
                if(args.Length!=4) return 2;
                using(var host=new Host(args[0],Int32.Parse(args[1]),args[2],args[3])) host.Run();
                return 0;
            }
            catch(Exception ex) {Console.Error.WriteLine(ex.GetBaseException().Message);return 1;}
        }
    }
}
