// Text-to-speech for reading answers aloud, via the browser's built-in
// SpeechSynthesis API — free, no server round-trip, no API key. Voice quality
// and available languages vary by browser/OS, but this is standard on
// Chrome, Edge, and Safari.

export function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel(); // don't let utterances overlap/queue
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function speechSupported() {
  return "speechSynthesis" in window;
}
