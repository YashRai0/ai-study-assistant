import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";

export default function UploadBox({ onUploaded }) {
  const inputRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("idle"); // idle | uploading | error
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  async function handleFile(file) {
    if (!file) return;
    setStatus("uploading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject", subject.trim() || "General");

    try {
      const { data } = await client.post("/upload", formData);
      onUploaded?.();
      navigate(`/chat/${data.pdfId}`);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.existingPdfId) {
        navigate(`/chat/${err.response.data.existingPdfId}`);
        return;
      }
      setStatus("error");
      setErrorMsg(
        err.response?.data?.error || "Something went wrong uploading this file. Please try again."
      );
      return;
    }
    setStatus("idle");
  }

  return (
    <div>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject (e.g. Operating Systems) — optional"
        className="mb-3 w-full rounded-full border border-ink-100 bg-white px-5 py-2 text-sm outline-none focus:border-highlight"
      />
      <label
        htmlFor="pdf-upload"
        className="group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink-400/40 bg-white/60 px-8 py-12 text-center transition hover:border-highlight hover:bg-white"
      >
        <span className="rounded-full bg-highlight/20 px-4 py-1 text-sm font-medium text-ink-900">
          {status === "uploading" ? "Reading your notes…" : "Drop a PDF or click to upload"}
        </span>
        <span className="font-display text-2xl text-ink-900">
          {status === "uploading" ? "Give it a moment" : "Start with one file"}
        </span>
        <span className="text-sm text-ink-400">
          {status === "uploading"
            ? "Scanned PDFs run through OCR and can take a bit longer"
            : "PDF only, up to 20MB"}
        </span>
        <input
          id="pdf-upload"
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {status === "error" && (
        <p className="mt-3 text-center text-sm text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
