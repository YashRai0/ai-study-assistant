/**
 * Audio playback and waveform helpers
 */

export function formatAudioTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function calculatePlaybackPercentage(currentTime, duration) {
  if (!duration || duration <= 0) return 0;
  const p = (Math.max(0, currentTime) / duration) * 100;
  return Math.min(100, Math.max(0, Math.round(p * 10) / 10));
}

export function generateWaveformBars(barCount = 36, seed = 42) {
  const bars = [];
  let s = seed;
  for (let i = 0; i < barCount; i++) {
    // Deterministic pseudo-random height between 20% and 100%
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280;
    // Bell-shaped curve weight towards the middle
    const midFactor = 1 - Math.abs((i - barCount / 2) / (barCount / 2)) * 0.4;
    const height = Math.max(18, Math.min(96, Math.round((rnd * 70 + 20) * midFactor)));
    bars.push(height);
  }
  return bars;
}

export function splitIntoSentences(text) {
  if (!text || typeof text !== "string") return [];
  // Split on sentence boundaries (. ! ?) while preserving text
  const raw = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  return raw.map((s) => s.trim()).filter(Boolean);
}

export function findActiveSentenceIndex(sentences, currentTime, totalDuration) {
  if (!sentences || sentences.length === 0 || !totalDuration || totalDuration <= 0) return 0;
  const fraction = Math.max(0, Math.min(1, currentTime / totalDuration));
  const idx = Math.floor(fraction * sentences.length);
  return Math.min(sentences.length - 1, Math.max(0, idx));
}
