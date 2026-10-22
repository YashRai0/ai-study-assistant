import test from "node:test";
import assert from "node:assert/strict";
import {
  formatAudioTime,
  calculatePlaybackPercentage,
  generateWaveformBars,
  splitIntoSentences,
  findActiveSentenceIndex
} from "../src/utils/audioHelpers.js";

test("formatAudioTime converts seconds to mm:ss format", () => {
  assert.equal(formatAudioTime(0), "0:00");
  assert.equal(formatAudioTime(5), "0:05");
  assert.equal(formatAudioTime(65), "1:05");
  assert.equal(formatAudioTime(130), "2:10");
  assert.equal(formatAudioTime(3600), "60:00");
  assert.equal(formatAudioTime(-5), "0:00");
  assert.equal(formatAudioTime(NaN), "0:00");
});

test("calculatePlaybackPercentage calculates accurate clamped percentage", () => {
  assert.equal(calculatePlaybackPercentage(0, 100), 0);
  assert.equal(calculatePlaybackPercentage(50, 100), 50);
  assert.equal(calculatePlaybackPercentage(120, 100), 100);
  assert.equal(calculatePlaybackPercentage(15, 60), 25);
  assert.equal(calculatePlaybackPercentage(10, 0), 0);
});

test("generateWaveformBars returns deterministic bar heights", () => {
  const bars = generateWaveformBars(24, 12345);
  assert.equal(bars.length, 24);
  bars.forEach((h) => {
    assert.ok(h >= 18 && h <= 100, `Bar height ${h} should be between 18 and 100`);
  });

  // Determinism
  const bars2 = generateWaveformBars(24, 12345);
  assert.deepEqual(bars, bars2);
});

test("splitIntoSentences splits paragraphs into clean sentences", () => {
  const text = "Neural networks learn representations. Backpropagation computes gradients! Can it converge? Yes.";
  const sentences = splitIntoSentences(text);
  assert.equal(sentences.length, 4);
  assert.equal(sentences[0], "Neural networks learn representations.");
  assert.equal(sentences[1], "Backpropagation computes gradients!");
  assert.equal(sentences[2], "Can it converge?");
  assert.equal(sentences[3], "Yes.");
});

test("findActiveSentenceIndex locates correct sentence according to playback progress", () => {
  const sentences = ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4"];
  // At start
  assert.equal(findActiveSentenceIndex(sentences, 0, 100), 0);
  // At 25%
  assert.equal(findActiveSentenceIndex(sentences, 25, 100), 1);
  // At 55%
  assert.equal(findActiveSentenceIndex(sentences, 55, 100), 2);
  // At 85%
  assert.equal(findActiveSentenceIndex(sentences, 85, 100), 3);
  // Past end
  assert.equal(findActiveSentenceIndex(sentences, 150, 100), 3);
});
