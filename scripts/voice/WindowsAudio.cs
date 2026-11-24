using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Speech.AudioFormat;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Threading;

namespace WorldStudio.Voice
{
    // One bounded PCM buffer per deliberate press. The wave device is closed
    // before recognition starts, and the sample never leaves process memory.
    internal sealed class Microphone : IDisposable
    {
        private const int SampleRate = 16000;
        private const int Capacity = SampleRate * 2 * 30;
        [StructLayout(LayoutKind.Sequential, Pack=2)]
        private struct Format
        {
            public ushort tag, channels;
            public uint rate, bytesPerSecond;
            public ushort alignment, bits, extra;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct Header
        {
            public IntPtr data;
            public uint size, recorded;
            public IntPtr user;
            public uint flags, loops;
            public IntPtr next, reserved;
        }

        [DllImport("winmm")] private static extern uint waveInOpen(out IntPtr h, uint device, ref Format f, IntPtr callback, IntPtr instance, uint flags);
        [DllImport("winmm")] private static extern uint waveInPrepareHeader(IntPtr h, IntPtr header, uint size);
        [DllImport("winmm")] private static extern uint waveInAddBuffer(IntPtr h, IntPtr header, uint size);
        [DllImport("winmm")] private static extern uint waveInStart(IntPtr h);
        [DllImport("winmm")] private static extern uint waveInReset(IntPtr h);
        [DllImport("winmm")] private static extern uint waveInUnprepareHeader(IntPtr h, IntPtr header, uint size);
        [DllImport("winmm")] private static extern uint waveInClose(IntPtr h);

        private IntPtr device, data, header;
        private bool prepared;
        private readonly uint headerSize = (uint)Marshal.SizeOf(typeof(Header));
        private static void Check(uint code)
        {
            if (code != 0) throw new InvalidOperationException("Windows microphone returned code " + code + ". Check input device and microphone access.");
        }
        public Microphone()
        {
            try
            {
                var format = new Format {tag=1, channels=1, rate=SampleRate, bytesPerSecond=SampleRate*2, alignment=2, bits=16};
                Check(waveInOpen(out device, UInt32.MaxValue, ref format, IntPtr.Zero, IntPtr.Zero, 0));
                data = Marshal.AllocHGlobal(Capacity);
                header = Marshal.AllocHGlobal((int)headerSize);
                Marshal.StructureToPtr(new Header {data=data, size=Capacity}, header, false);
                Check(waveInPrepareHeader(device, header, headerSize));
                prepared = true;
                Check(waveInAddBuffer(device, header, headerSize));
                Check(waveInStart(device));
            }
            catch {Dispose(); throw;}
        }
        public byte[] Stop()
        {
            Check(waveInReset(device));
            var result = (Header)Marshal.PtrToStructure(header, typeof(Header));
            if (result.recorded > Capacity) throw new InvalidDataException("Invalid audio buffer length");
            var pcm = new byte[result.recorded];
            Marshal.Copy(data, pcm, 0, pcm.Length);
            return pcm;
        }
        public void Dispose()
        {
            if (device != IntPtr.Zero)
            {
                waveInReset(device);
                if (prepared) waveInUnprepareHeader(device, header, headerSize);
                waveInClose(device);
                device=IntPtr.Zero;
            }
            if (header!=IntPtr.Zero) {Marshal.FreeHGlobal(header); header=IntPtr.Zero;}
            if (data!=IntPtr.Zero) {Marshal.FreeHGlobal(data); data=IntPtr.Zero;}
        }
    }

    internal static class LocalSpeech
    {
        internal static SpeechAudioFormatInfo Format()
        {
            return new SpeechAudioFormatInfo(16000, AudioBitsPerSample.Sixteen, AudioChannel.Mono);
        }
        internal static SpeechRecognitionEngine Recognizer(string culture)
        {
            var info=SpeechRecognitionEngine.InstalledRecognizers().FirstOrDefault(
                r => String.IsNullOrEmpty(culture) || r.Culture.Name.Equals(culture, StringComparison.OrdinalIgnoreCase));
            if(info==null) throw new InvalidOperationException("Install a Windows desktop speech recognition language matching the configured culture.");
            var engine=new SpeechRecognitionEngine(info);
            try {engine.LoadGrammar(new DictationGrammar()); return engine;}
            catch {engine.Dispose(); throw;}
        }
        internal static SpeechSynthesizer Synthesizer(string voice)
        {
            var synth=new SpeechSynthesizer();
            try
            {
                if(!String.IsNullOrEmpty(voice)) synth.SelectVoice(voice);
                return synth;
            }
            catch {synth.Dispose(); throw;}
        }

        internal static string Transcribe(byte[] pcm, string culture)
        {
            if(pcm.Length<3200) return "";
            using(var audio=new MemoryStream())
            using(var engine=Recognizer(culture))
            using(var done=new ManualResetEvent(false))
            {
                audio.Write(pcm,0,pcm.Length);
                var silence=new byte[16000];
                audio.Write(silence,0,silence.Length);
                audio.Position=0;
                engine.SetInputToAudioStream(audio,Format());
                var phrases=new List<string>();
                Exception error=null;
                engine.SpeechRecognized+=(s,e)=>{
                    if(e.Result.Confidence>=0.50f && !String.IsNullOrWhiteSpace(e.Result.Text)) phrases.Add(e.Result.Text);
                };
                engine.RecognizeCompleted+=(s,e)=>{error=e.Error;done.Set();};
                engine.RecognizeAsync(RecognizeMode.Multiple);
                if(!done.WaitOne(20000))
                {
                    engine.RecognizeAsyncCancel();
                    done.WaitOne();
                    throw new TimeoutException("Windows dictation timed out.");
                }
                if(error!=null) throw error;
                return String.Join(" ",phrases);
            }
        }

        // The smoke test deliberately routes the synthesizer to memory and the
        // recognizer to that stream. Neither physical audio device is opened.
        internal static string RoundTrip(string culture,string voice)
        {
            using(var pcm=new MemoryStream())
            using(var synth=Synthesizer(voice))
            {
                synth.SetOutputToAudioStream(pcm,Format());
                synth.Speak("The river runs through the valley.");
                return Transcribe(pcm.ToArray(),culture);
            }
        }
    }
}
