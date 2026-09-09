import { fetchTranscript, YoutubeTranscriptError } from "youtube-transcript";
import logger from "../utils/logger.js";

/**
 * Groups transcript segments into fixed-size batches (not time windows) —
 * a raw transcript is one long stream of few-second segments with no
 * natural page boundary of its own, so this imposes one rather than
 * treating an hour-long video's transcript as a single giant chunk.
 *
 * Deliberately segment-count-based, not time-based: youtube-transcript's
 * own parseTranscriptXml returns `offset`/`duration` in milliseconds for
 * one XML format YouTube may respond with (srv3) and in seconds for the
 * other (classic) — confirmed directly in its source, not normalized to a
 * consistent unit before being returned. A caller can't reliably tell
 * which format produced a given response, so a fixed-time-window
 * threshold against `offset` would silently group wrong (a bug an actual
 * test against the library's real classic-format parsing path caught:
 * seconds-scale offsets never crossed a milliseconds-scale threshold).
 * Segment count has no such dependency.
 */
const SEGMENTS_PER_PAGE = 40; // roughly 2-3 minutes of typical caption pacing

function groupIntoPages(segments) {
  const pages = [];
  for (let i = 0; i < segments.length; i += SEGMENTS_PER_PAGE) {
    pages.push(segments.slice(i, i + SEGMENTS_PER_PAGE).map((s) => s.text).join(" "));
  }
  return pages;
}

/**
 * Extracts a normalized transcript from a YouTube video URL or ID.
 *
 * IMPORTANT — verification limitation: the actual network call to
 * YouTube (fetchTranscript's default `fetch`) cannot be exercised from
 * this environment — the sandbox's egress policy blocks non-allowlisted
 * hosts including youtube.com (confirmed directly: a request to
 * youtube.com here returns HTTP 403 with header `x-deny-reason:
 * host_not_allowed`, not a YouTube-side error). What IS verified: this
 * function's own logic (grouping, normalization, error handling) is
 * tested end-to-end against fetchTranscript's REAL parsing code by
 * injecting a mock `fetchFn` that returns a realistic transcript XML
 * response in the exact format fetchTranscript's own parseTranscriptXml
 * expects (see test/youtubeParser.test.js) — so everything downstream of
 * "YouTube responded with a transcript" is exercised for real; only the
 * "and YouTube actually responds" part is unverified here.
 */
export async function extractTranscriptFromYouTube(videoUrlOrId, { lang, fetchFn } = {}) {
  let segments;
  try {
    segments = await fetchTranscript(videoUrlOrId, { lang, fetch: fetchFn });
  } catch (err) {
    if (err instanceof YoutubeTranscriptError) {
      // Re-throw with the library's own message (already descriptive:
      // "transcript is disabled", "video unavailable", "too many
      // requests", etc.) rather than wrapping it in a generic error.
      throw new Error(err.message.replace(/^\[YoutubeTranscript\]\s*🚨\s*/, ""));
    }
    throw err;
  }

  if (!segments?.length) {
    throw new Error("No transcript available for this video.");
  }

  const pages = groupIntoPages(segments);
  const fullText = pages.map((text, i) => `--- Page ${i + 1} ---\n${text}`).join("\n");

  logger.info({ videoUrlOrId, segmentCount: segments.length, pageCount: pages.length }, "YouTube transcript extracted");

  return { pages, fullText, method: "youtube" };
}
