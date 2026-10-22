import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsyncUpload } from "../hooks/useAsyncUpload.js";

export default function UploadBox({ onUploaded }) {
  const inputRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const navigate = useNavigate();
  const { uploadPdf, addYoutubeVideo, progress, error, status } = useAsyncUpload();

  async function handleFile(file) {
    if (!file) return;

    try {
      const result = await uploadPdf(file, subject.trim() || "General");
      onUploaded?.();
      // Redirect to chat once processing is complete (status === "ready")
      navigate(`/chat/${result.pdfId}`);
    } catch (err) {
      // useAsyncUpload already sets error state
      // Duplicate detection: if 409, try to navigate to existing PDF
      if (err.response?.status === 409 && err.response.data?.existingPdfId) {
        navigate(`/chat/${err.response.data.existingPdfId}`);
      }
    }
  }

  async function handleYoutubeSubmit(e) {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    try {
      const result = await addYoutubeVideo(youtubeUrl.trim(), subject.trim() || "General");
      onUploaded?.();
      navigate(`/chat/${result.pdfId}`);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.existingPdfId) {
        navigate(`/chat/${err.response.data.existingPdfId}`);
      }
    }
  }

  const isProcessing = status !== "idle" && status !== "error";

  return (
    <div>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (e.g. Operating Systems) — optional"
        disabled={isProcessing}
        className="mb-3 w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-4 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight disabled:bg-ink-50 dark:disabled:bg-[#0e1320]"
      />
      <label
        htmlFor="pdf-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-12 text-center transition ${
          isProcessing
            ? "border-ink-200 dark:border-ink-800 cursor-not-allowed bg-ink-50/50 dark:bg-[#131a2c]/40"
            : isDragOver
            ? "border-highlight bg-highlight/10 dark:bg-highlight/15"
            : "border-ink-300 dark:border-[#273352] bg-white/70 dark:bg-[#1b233a]/60 hover:border-highlight dark:hover:border-highlight hover:bg-white dark:hover:bg-[#1b233a]"
        }`}
      >
        <span className="rounded-full bg-highlight/20 dark:bg-highlight/20 px-4 py-1 text-xs font-semibold text-amber-950 dark:text-amber-200 border border-highlight/40">
          {status === "uploading" && "Uploading bytes…"}
          {status === "parsing" && "Extracting document text…"}
          {status === "embedding" && "Building semantic vector index…"}
          {(status === "idle" || status === "error") && "Drop a PDF, Word doc, slide deck, or audio file, or click to browse"}
        </span>
        <span className="font-display text-2xl font-bold text-ink-900 dark:text-ink-50">
          {isProcessing ? `${Math.round(progress)}% complete` : "Start with one file"}
        </span>
        <span className="text-xs text-ink-500 dark:text-ink-400">
          {status === "parsing"
            ? "Converting pages and running OCR if scanned"
            : status === "embedding"
            ? "Partitioning concepts into 384-d semantic vectors"
            : "PDF, DOCX, PPTX, or audio (MP3, M4A, WAV), up to 20MB"}
        </span>

        {/* Progress bar during processing */}
        {isProcessing && (
          <div className="mt-4 w-full max-w-xs rounded-full bg-ink-200 dark:bg-ink-800 h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-highlight to-amber-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <input
          id="pdf-upload"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx,audio/*,.mp3,.wav,.m4a"
          disabled={isProcessing}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p className="mt-3 text-center text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-2.5 rounded-xl">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3 text-xs text-ink-400">
        <div className="h-px flex-1 bg-ink-200 dark:bg-[#273352]" />
        or import lecture link
        <div className="h-px flex-1 bg-ink-200 dark:bg-[#273352]" />
      </div>

      <form onSubmit={handleYoutubeSubmit} className="mt-4 flex gap-2">
        <input
          type="url"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="Paste a YouTube lecture URL (captions required)"
          disabled={isProcessing}
          className="flex-1 rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-4 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight disabled:bg-ink-50"
        />
        <button
          type="submit"
          disabled={isProcessing || !youtubeUrl.trim()}
          className="rounded-xl bg-ink-900 dark:bg-highlight px-5 py-2.5 text-xs font-semibold text-paper dark:text-ink-950 transition hover:opacity-90 disabled:opacity-40"
        >
          Add video
        </button>
      </form>
    </div>
  );
}
