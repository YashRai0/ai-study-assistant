import { useRef, useState } from "react";
import client from "../api/client.js";

// Records mic audio via MediaRecorder, sends it to the backend for
// transcription (Groq Whisper), and hands the resulting text back to
// whichever page embeds this — Chat or MultiChat drop the text straight
// into their message input.
export default function VoiceInput({ onTranscribed, onError, disabled }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("Voice input isn't supported in this browser. Please type your question instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        setBusy(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const { data } = await client.post("/voice/transcribe", formData);
          if (data.text) {
            onTranscribed(data.text);
          } else {
            onError?.("Didn't catch that — please try again or type your question.");
          }
        } catch (err) {
          onError?.(
            err.response?.data?.error || "Couldn't transcribe that recording. Please try typing instead."
          );
        } finally {
          setBusy(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      onError?.("Microphone access was denied. Please allow microphone access, or type your question instead.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={recording ? stopRecording : startRecording}
      title={recording ? "Stop recording" : "Ask by voice"}
      className={`shrink-0 rounded-full px-4 py-3 text-sm font-medium transition disabled:opacity-50 ${
        recording ? "animate-pulse bg-red-600 text-white" : "border border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-paper"
      }`}
    >
      {busy ? "…" : recording ? "Stop" : "🎤"}
    </button>
  );
}
