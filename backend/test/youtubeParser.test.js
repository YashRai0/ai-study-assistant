import test from "node:test";
import assert from "node:assert/strict";
import { extractTranscriptFromYouTube } from "../src/services/youtubeParser.js";

const CAPTION_TRACK_URL = "https://www.youtube.com/api/timedtext?fake=1";

// Real classic-format transcript XML, matching fetchTranscript's own
// RE_XML_TRANSCRIPT regex exactly (offset/duration in seconds, as strings).
function buildTranscriptXml(segments) {
  const body = segments
    .map((s) => `<text start="${s.start}" dur="${s.dur}">${s.text}</text>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><transcript>${body}</transcript>`;
}

function mockFetch({ segments, innerTubeFails = false }) {
  return async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/youtubei/v1/player")) {
      if (innerTubeFails) {
        return { ok: false, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [{ baseUrl: CAPTION_TRACK_URL, languageCode: "en" }],
            },
          },
        }),
      };
    }
    if (urlStr.startsWith(CAPTION_TRACK_URL)) {
      return { ok: true, text: async () => buildTranscriptXml(segments) };
    }
    throw new Error(`Unexpected fetch to ${urlStr} in test mock`);
  };
}

test("extracts and normalizes a real transcript via the library's actual InnerTube + XML parsing path", async () => {
  const segments = [
    { start: "0", dur: "3", text: "Welcome to this lecture on photosynthesis." },
    { start: "3", dur: "4", text: "Plants convert light into chemical energy." },
  ];

  const result = await extractTranscriptFromYouTube("dQw4w9WgXcQ", { fetchFn: mockFetch({ segments }) });

  assert.equal(result.method, "youtube");
  assert.ok(result.pages.length >= 1);
  assert.match(result.fullText, /photosynthesis/);
  assert.match(result.fullText, /chemical energy/);
  assert.match(result.fullText, /--- Page 1 ---/);
});

test("groups transcripts with many segments into multiple pages", async () => {
  // 85 segments, well over the 40-per-page threshold — proves
  // groupIntoPages actually splits rather than treating everything as
  // one page, without depending on offset/duration units at all.
  const segments = Array.from({ length: 85 }, (_, i) => ({
    start: String(i * 3),
    dur: "3",
    text: `Segment number ${i}.`,
  }));

  const result = await extractTranscriptFromYouTube("dQw4w9WgXcQ", { fetchFn: mockFetch({ segments }) });

  assert.equal(result.pages.length, 3); // 85 segments / 40 per page = 3 pages (40, 40, 5)
  assert.match(result.pages[0], /Segment number 0\./);
  assert.match(result.pages[2], /Segment number 84\./);
});

test("throws a clear, unwrapped error message when the video has no transcript", async () => {
  const fetchFn = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/youtubei/v1/player")) {
      return { ok: true, json: async () => ({ captions: undefined }) };
    }
    // Web-page fallback: simulate a page with playabilityStatus but no
    // caption tracks, matching YoutubeTranscriptDisabledError's real
    // trigger condition in the library's own fetchViaWebPage.
    return {
      ok: true,
      text: async () =>
        `<html>"playabilityStatus": {}, var ytInitialPlayerResponse = {"captions":{}};</html>`,
    };
  };

  await assert.rejects(
    () => extractTranscriptFromYouTube("dQw4w9WgXcQ", { fetchFn }),
    (err) => {
      assert.match(err.message, /transcript/i);
      // Confirms our wrapper strips the library's own "[YoutubeTranscript] 🚨" prefix
      assert.ok(!err.message.includes("YoutubeTranscript"));
      return true;
    }
  );
});

test("groupIntoPages behavior: a single short transcript stays as one page", async () => {
  const segments = [{ start: "0", dur: "2", text: "Just one short segment." }];
  const result = await extractTranscriptFromYouTube("dQw4w9WgXcQ", { fetchFn: mockFetch({ segments }) });
  assert.equal(result.pages.length, 1);
});
