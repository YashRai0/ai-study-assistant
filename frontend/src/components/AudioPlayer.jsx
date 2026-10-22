import { useState, useEffect, useRef, useMemo } from "react";
import {
  formatAudioTime,
  calculatePlaybackPercentage,
  generateWaveformBars,
  splitIntoSentences,
  findActiveSentenceIndex
} from "../utils/audioHelpers.js";

/**
 * Modern tactile Audio Waveform & Speech Player
 * Supports native HTML5 audio files or browser speech synthesis with transcript sync.
 */
export default function AudioPlayer({
  src = null,
  text = "",
  title = "Lecture Audio & Synthesizer",
  compact = false,
  onComplete = null
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(!compact);

  const audioRef = useRef(null);
  const synthUtteranceRef = useRef(null);
  const synthTimerRef = useRef(null);

  // Generate deterministic waveform bars
  const waveformBars = useMemo(() => generateWaveformBars(compact ? 28 : 42, 101), [compact]);

  // Split transcript text into sentences
  const sentences = useMemo(() => splitIntoSentences(text), [text]);

  const hasAudioSource = Boolean(src);
  const hasSpeechSynthesis = !hasAudioSource && Boolean(text) && typeof window !== "undefined" && "speechSynthesis" in window;

  // Estimated duration if using speech synthesis (avg 130 words per min)
  const estimatedSynthDuration = useMemo(() => {
    if (!text) return 30;
    const wordCount = text.split(/\s+/).length;
    return Math.max(10, Math.round((wordCount / (130 * playbackRate)) * 60));
  }, [text, playbackRate]);

  // Initialize durations
  useEffect(() => {
    if (!hasAudioSource && hasSpeechSynthesis) {
      setDuration(estimatedSynthDuration);
    }
  }, [hasAudioSource, hasSpeechSynthesis, estimatedSynthDuration]);

  // Audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function handleLoadedMetadata() {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    }

    function handleTimeUpdate() {
      setCurrentTime(audio.currentTime);
    }

    function handleEnded() {
      setIsPlaying(false);
      setCurrentTime(0);
      if (onComplete) onComplete();
    }

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [onComplete]);

  // Play / Pause handling
  function togglePlay() {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    if (hasAudioSource && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else if (hasSpeechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = playbackRate;
      utterance.volume = isMuted ? 0 : volume;

      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (synthTimerRef.current) clearInterval(synthTimerRef.current);
        if (onComplete) onComplete();
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        if (synthTimerRef.current) clearInterval(synthTimerRef.current);
      };

      synthUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);

      // Approximate progress tracking for SpeechSynthesis
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
      const startT = Date.now() - (currentTime * 1000) / playbackRate;
      synthTimerRef.current = setInterval(() => {
        const elapsed = ((Date.now() - startT) / 1000) * playbackRate;
        if (elapsed >= estimatedSynthDuration) {
          setCurrentTime(estimatedSynthDuration);
        } else {
          setCurrentTime(elapsed);
        }
      }, 250);
    }
  }

  function pausePlayback() {
    if (hasAudioSource && audioRef.current) {
      audioRef.current.pause();
    } else if (hasSpeechSynthesis) {
      window.speechSynthesis.cancel();
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
    }
    setIsPlaying(false);
  }

  // Seek handler
  function seekTo(targetSeconds) {
    const clamped = Math.max(0, Math.min(duration, targetSeconds));
    setCurrentTime(clamped);
    if (hasAudioSource && audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
  }

  function skipBy(deltaSeconds) {
    seekTo(currentTime + deltaSeconds);
  }

  // Change playback speed
  function handleRateChange(newRate) {
    setPlaybackRate(newRate);
    if (hasAudioSource && audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
    if (isPlaying && hasSpeechSynthesis) {
      pausePlayback();
      setTimeout(startPlayback, 100);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasAudioSource && audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
    };
  }, [hasAudioSource]);

  const activeSentenceIdx = findActiveSentenceIndex(sentences, currentTime, duration || 1);
  const progressPercent = calculatePlaybackPercentage(currentTime, duration);

  return (
    <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white p-5 shadow-sm sm:p-6">
      {hasAudioSource && <audio ref={audioRef} src={src} preload="metadata" />}

      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            {isPlaying ? (
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
              </span>
            ) : (
              <span>🎙️</span>
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-ink-900">{title}</h4>
            <p className="text-xs text-ink-400">
              {hasAudioSource ? "High-Fidelity Audio Stream" : "Neural Speech Synthesizer"} · {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
            </p>
          </div>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 rounded-xl border border-ink-100 bg-paper p-1 text-xs">
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => handleRateChange(rate)}
              className={`rounded-lg px-2 py-0.5 font-semibold transition ${
                playbackRate === rate ? "bg-ink-900 text-paper shadow-xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Waveform Display */}
      <div className="mt-5 rounded-2xl bg-slate-900 p-4">
        <div
          className="flex h-20 items-end justify-between gap-1 cursor-pointer select-none"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickFraction = (e.clientX - rect.left) / rect.width;
            seekTo(clickFraction * duration);
          }}
        >
          {waveformBars.map((barHeight, idx) => {
            const barFraction = idx / waveformBars.length;
            const isPassed = (barFraction * 100) <= progressPercent;
            return (
              <div
                key={idx}
                style={{ height: `${barHeight}%` }}
                className={`w-full rounded-full transition-all duration-150 ${
                  isPassed
                    ? "bg-gradient-to-t from-indigo-500 to-indigo-300"
                    : "bg-slate-700 hover:bg-slate-600"
                } ${isPlaying && isPassed ? "opacity-100" : "opacity-80"}`}
              />
            );
          })}
        </div>

        {/* Scrub Bar */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <div
            className="mx-3 relative flex-1 h-1.5 rounded-full bg-slate-800 cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickFraction = (e.clientX - rect.left) / rect.width;
              seekTo(clickFraction * duration);
            }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full bg-indigo-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>

      {/* Primary Control Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Replay 5s */}
          <button
            type="button"
            onClick={() => skipBy(-5)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-100 bg-paper text-ink-700 transition hover:bg-white hover:border-ink-300"
            title="Rewind 5 seconds"
          >
            ↺ 5s
          </button>

          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-900 text-paper shadow-md transition hover:bg-ink-800 active:scale-95"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <span className="text-base font-bold">❚❚</span>
            ) : (
              <span className="text-base font-bold ml-0.5">▶</span>
            )}
          </button>

          {/* Skip 5s */}
          <button
            type="button"
            onClick={() => skipBy(5)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-100 bg-paper text-ink-700 transition hover:bg-white hover:border-ink-300"
            title="Forward 5 seconds"
          >
            5s ↻
          </button>
        </div>

        {/* Volume & Transcript Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="text-sm text-ink-600 hover:text-ink-900"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>

          {sentences.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                showTranscript
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-ink-200 bg-paper text-ink-600 hover:bg-white"
              }`}
            >
              {showTranscript ? "Hide Transcript" : "Show Transcript"}
            </button>
          )}
        </div>
      </div>

      {/* Transcript with Synchronized Sentence Highlighting */}
      {showTranscript && sentences.length > 0 && (
        <div className="mt-5 rounded-2xl border border-ink-100 bg-paper p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
            <span>Synchronized Transcript</span>
            <span>Click sentence to jump</span>
          </div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto text-sm leading-relaxed text-ink-700">
            {sentences.map((sent, idx) => {
              const isActive = idx === activeSentenceIdx;
              return (
                <span
                  key={idx}
                  onClick={() => {
                    const jumpTime = (idx / sentences.length) * duration;
                    seekTo(jumpTime);
                  }}
                  className={`inline cursor-pointer rounded px-1 py-0.5 transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white font-medium shadow-xs"
                      : "hover:bg-ink-100 text-ink-800"
                  }`}
                >
                  {sent}{" "}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
