import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsyncUpload } from "../hooks/useAsyncUpload.js";

export default function UploadBox({ onUploaded }) {
  const inputRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
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
        className="mb-3 w-full rounded-full border border-ink-100 bg-white px-5 py-2 text-sm outline-none focus:border-highlight disabled:bg-ink-50"
      />
      <label
        htmlFor="pdf-upload"
        className={`group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white/60 px-8 py-12 text-center transition ${
          isProcessing
            ? "border-ink-200 cursor-not-allowed bg-ink-50"
            : "border-ink-400/40 hover:border-highlight hover:bg-white"
        }`}
      >
        <span className="rounded-full bg-highlight/20 px-4 py-1 text-sm font-medium text-ink-900">
          {status === "uploading" && "Uploading…"}
          {status === "parsing" && "Parsing your file…"}
          {status === "embedding" && "Processing notes…"}
          {(status === "idle" || status === "error") && "Drop a PDF, Word doc, slide deck, or audio file, or click to upload"}
        </span>
        <span className="font-display text-2xl text-ink-900">
          {isProcessing ? `${Math.round(progress)}% complete` : "Start with one file"}
        </span>
        <span className="text-sm text-ink-400">
          {status === "parsing"
            ? "Extracting text from your file"
            : status === "embedding"
            ? "Building semantic index (this can take a minute for long files)"
            : "PDF, DOCX, PPTX, or audio, up to 20MB"}
        </span>

        {/* Progress bar during processing */}
        {isProcessing && (
          <div className="mt-3 w-full max-w-xs rounded-full bg-ink-200 h-2">
            <div
              className="h-full rounded-full bg-highlight transition-all"
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
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center gap-3 text-xs text-ink-400">
        <div className="h-px flex-1 bg-ink-100" />
        or
        <div className="h-px flex-1 bg-ink-100" />
      </div>

      <form onSubmit={handleYoutubeSubmit} className="mt-4 flex gap-2">
        <input
          type="url"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="Paste a YouTube video URL"
          disabled={isProcessing}
          className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-2 text-sm outline-none focus:border-highlight disabled:bg-ink-50"
        />
        <button
          type="submit"
          disabled={isProcessing || !youtubeUrl.trim()}
          className="rounded-full bg-ink-900 px-5 py-2 text-sm text-paper disabled:opacity-40"
        >
          Add video
        </button>
      </form>
    </div>
  );
}