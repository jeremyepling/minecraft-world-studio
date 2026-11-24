# Speak to World Studio in Minecraft

In the running WorldStudioLab, type `@studio voice on`. Close chat, face the location you want to refer to, hold **F8** and wait for **Listening** before you speak. Release F8 to send the utterance. For a first test, say “What am I looking at?” The listener routes the recognized words through the same collaboration handler as an addressed chat message. Keep the game focused while transcription completes.

Use `@studio spoken on` for spoken replies. Recognition and playback have separate switches. Use `@studio voice off` to disarm input or `@studio spoken off` to stop playback. `@studio voice status` and `@studio spoken status` report the choices. Both features start off on a fresh install. The last choices survive restarting the listener.

## Windows setup

The helper uses the Windows desktop speech recognition language and local SAPI voices. These run through .NET Framework 4.x on 64-bit Windows. On first enable, the listener compiles its two checked-in C# sources with the Windows framework compiler and caches the executable under the listener’s private directory. The lab machine had an English (US) recognition language and two English desktop voices.

The listener creates `local/chat-loop/voice.json` when you enable or disable a setting. Stop the listener before editing this file, then restart it. Set `key` to a single function key F1–F24 that is free in your Minecraft controls. For instance, this configuration uses F9, English (US) recognition and Windows' default synthesis voice.

```json
{
  "voice": true,
  "spoken": false,
  "inputProvider": "windows",
  "outputProvider": "windows",
  "key": "F9",
  "culture": "en-US",
  "voiceName": ""
}
```

Each provider field accepts `windows` or `off`. An empty `culture` selects the first installed desktop recognizer. Set `voiceName` to the exact name of an installed desktop voice to choose a particular speaker. The Windows helper supplies the in-game hold gesture. The Minecraft instance and the agent runtime stay independent of the selected voice. Raw audio uses a bounded in-memory PCM buffer and goes to the local recognizer. The transcript becomes ordinary Studio input and may be sent as text to the configured agent. [Windows speech recognition](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine) · [Windows speech synthesis](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer)

## What the listener checks

The key is polled only when the foreground window belongs to a Fabric Java client with the exact private `--gameDir` from the Studio installation. Audio capture needs a fresh key-down and a successful lab-context check. The listener renews that check during the hold and checks the world again before dispatching a transcript. Changing windows, leaving the lab, losing authorization or stopping the listener disarms capture and discards the interrupted utterance. A hold is limited to 30 seconds; release and press again to retry. Audio feedback is interrupted before the microphone opens. Clear, short utterances give the Windows dictation engine a better chance of recognizing block names and locations.

If recognition cannot start, check the configured speech language, the Windows default input device and permission for desktop apps to use the microphone. If playback fails, check the Windows default output device and the selected desktop voice. Text commands continue to work while either device is unavailable. The current release provides the Windows speech backend. Additional recognizers and synthesizers can be integrated at the listener boundary.

## Repeatable verification

From the repository root, run these checks with Node.js 22.16 or newer.

```powershell
node --test scripts/studio-voice.test.mjs
node scripts/check-voice.mjs
```

The first command checks independent toggles, persisted settings, denial on a changed world, stale transcription and teardown. The second requires the English (US) desktop recognizer and an English voice in a normal Windows user session. It compiles the real helper in a temporary directory, checks exact instance matching, synthesizes “The river runs through the valley” into memory, and verifies the recognized words. It does not open the microphone or speakers.

For a physical acceptance pass, enable both switches, hold the chosen key, wait for the HUD cue, and ask a harmless question about the current view. Check that the transcript matches your words and that you hear the reply. Start another hold and switch to a different window before releasing. The interrupted utterance should never become a turn. Finally disable both switches and repeat the same question in text.
