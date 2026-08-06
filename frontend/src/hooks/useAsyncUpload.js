// File: frontend/src/hooks/useAsyncUpload.js
// NEW Hook: Handle async PDF uploads with job status polling

import { useState, useCallback } from "react";
import { useAuth } from "../api/AuthContext";

/**
 * useAsyncUpload: Manage PDF uploads with background job polling
 *
 * Usage:
 *   const { uploadPdf, progress, error, status } = useAsyncUpload();
 *   const result = await uploadPdf(file, subject);
 *
 * Returns:
 *   - uploadPdf(file, subject): async function to upload and poll
 *   - progress: 0-100 (upload + parsing + embedding progress)
 *   - error: error message if job failed
 *   - status: 'idle' | 'uploading' | 'parsing' | 'embedding' | 'ready' | 'error'
 */
export function useAsyncUpload() {
  const { apiClient } = useAuth();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("idle");

  const pollJobStatus = useCallback(
    async (pdfId, maxWaitMs = 5 * 60 * 1000) => {
      const startTime = Date.now();
      let pollIntervalMs = 500;
      let uploadProgress = 0;
      let embedProgress = 0;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const response = await apiClient.get(`/upload/${pdfId}/status`);
          const { processingStatus, uploadJob, embedJob, chunksReady } = response.data;

          // Calculate overall progress
          if (uploadJob) {
            uploadProgress = uploadJob.progress || 0;
            if (uploadJob.state === "completed") uploadProgress = 100;
            if (uploadJob.state === "failed") {
              throw new Error(`Upload job failed: ${uploadJob.failedReason}`);
            }
          }

          if (embedJob) {
            embedProgress = embedJob.progress || 0;
            if (embedJob.state === "completed") embedProgress = 100;
            if (embedJob.state === "failed") {
              throw new Error(`Embedding job failed: ${embedJob.failedReason}`);
            }
          }

          // Overall progress: 30% upload, 70% embedding
          const overallProgress = Math.round(uploadProgress * 0.3 + embedProgress * 0.7);
          setProgress(overallProgress);

          // Update status
          if (processingStatus === "ready" || (chunksReady && embedJob?.state === "completed")) {
            setStatus("ready");
            setProgress(100);
            return { pdfId, status: "ready", chunksReady: true };
          }

          if (uploadJob?.state === "active" || uploadProgress < 100) {
            setStatus("parsing");
          } else if (embedJob?.state === "active" || embedProgress < 100) {
            setStatus("embedding");
          }

          // Poll again after interval
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          pollIntervalMs = Math.min(pollIntervalMs * 1.2, 3000); // Cap at 3s
        } catch (err) {
          setError(err.message);
          setStatus("error");
          throw err;
        }
      }

      throw new Error("Upload processing timed out after 5 minutes");
    },
    [apiClient]
  );

  const uploadPdf = useCallback(
    async (file, subject = "General") => {
      setError(null);
      setProgress(0);
      setStatus("uploading");

      try {
        // 1. POST file (fast, returns immediately with job IDs)
        const formData = new FormData();
        formData.append("file", file);
        formData.append("subject", subject);

        const uploadResponse = await apiClient.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const { pdfId, uploadJobId, embedJobId, synthesisJobId } = uploadResponse.data;

        if (uploadResponse.status !== 202) {
          throw new Error("Upload did not return 202 Accepted");
        }

        // 2. Poll job status until ready
        const result = await pollJobStatus(pdfId);

        return {
          pdfId,
          uploadJobId,
          embedJobId,
          synthesisJobId,
          status: "success",
          ...result,
        };
      } catch (err) {
        setError(err.message);
        setStatus("error");
        throw err;
      }
    },
    [apiClient, pollJobStatus]
  );

  return { uploadPdf, progress, error, status };
}
