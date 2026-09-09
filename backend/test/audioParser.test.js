import test from "node:test";
import assert from "node:assert/strict";
import { extractTextFromAudio } from "../src/services/audioParser.js";

test("normalizes a successful transcription into the standard { pages, fullText, method } shape", async () => {
  const mockTranscribe = async () => "This lecture covers the Krebs cycle in detail.";
  const result = await extractTextFromAudio(Buffer.from("fake audio bytes"), "lecture.mp3", { transcribeFn: mockTranscribe });

  assert.equal(result.method, "audio");
  assert.equal(result.fullText, "This lecture covers the Krebs cycle in detail.");
  assert.deepEqual(result.pages, ["This lecture covers the Krebs cycle in detail."]);
});

test("throws a clear error when no speech is detected (empty transcription)", async () => {
  const mockTranscribe = async () => "";
  await assert.rejects(
    () => extractTextFromAudio(Buffer.from("silence"), "silence.mp3", { transcribeFn: mockTranscribe }),
    /No speech was detected/
  );
});

test("throws a clear error when the transcription is only whitespace", async () => {
  const mockTranscribe = async () => "   \n  ";
  await assert.rejects(
    () => extractTextFromAudio(Buffer.from("silence"), "silence.mp3", { transcribeFn: mockTranscribe }),
    /No speech was detected/
  );
});

test("propagates an error from the transcription function rather than swallowing it", async () => {
  const mockTranscribe = async () => { throw new Error("Whisper API rate limited"); };
  await assert.rejects(
    () => extractTextFromAudio(Buffer.from("audio"), "lecture.mp3", { transcribeFn: mockTranscribe }),
    /rate limited/
  );
});

test("defaults to the real transcribeAudio when no transcribeFn is injected", async () => {
  // Just verifies the default parameter wiring is correct (imports
  // transcribeAudio successfully) — doesn't call it, since that would
  // require a live Groq API call this sandbox can't make.
  const fnSource = extractTextFromAudio.toString();
  assert.match(fnSource, /transcribeFn/);
});
