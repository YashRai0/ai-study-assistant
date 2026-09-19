import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

function computeContentHash(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest("hex");
}

test("documentIdentity: same file content produces identical SHA-256 hash", () => {
  const content = "Introduction to Database Systems - Lecture 1 Notes";
  const hash1 = computeContentHash(content);
  const hash2 = computeContentHash(Buffer.from(content, "utf8"));

  assert.equal(hash1, hash2, "Content hashes must match for identical content");
  assert.equal(hash1.length, 64, "SHA-256 hash must be 64 hexadecimal characters");
});

test("documentIdentity: different file content produces different hashes", () => {
  const contentA = "Lecture 1: Functional Dependencies";
  const contentB = "Lecture 2: Normalization Forms";

  const hashA = computeContentHash(contentA);
  const hashB = computeContentHash(contentB);

  assert.notEqual(hashA, hashB, "Different contents must yield distinct hashes");
});

test("documentIdentity: renaming a file does not alter its content hash", () => {
  const rawBytes = Buffer.from("%PDF-1.4 Mock PDF Content with academic text", "utf8");

  const upload1 = {
    filename: "cs101_chapter1.pdf",
    hash: computeContentHash(rawBytes),
  };

  const upload2 = {
    filename: "my_renamed_notes_v2.pdf",
    hash: computeContentHash(rawBytes),
  };

  assert.notEqual(upload1.filename, upload2.filename, "Filenames differ");
  assert.equal(upload1.hash, upload2.hash, "Content hash must be purely content-based, ignoring filename");
});

test("documentIdentity: per-owner compound uniqueness allows distinct users to upload same file", () => {
  const sharedFileBytes = Buffer.from("%PDF-1.4 Standard MIT Course Syllabus", "utf8");
  const sharedHash = computeContentHash(sharedFileBytes);

  const mockDb = new Map(); // key: `${owner}:${contentHash}`

  function insertDocument(owner, filename, contentHash) {
    const key = `${owner}:${contentHash}`;
    if (mockDb.has(key)) {
      const err = new Error(`E11000 duplicate key error collection: index: owner_1_contentHash_1 dup key: { owner: "${owner}", contentHash: "${contentHash}" }`);
      err.code = 11000;
      throw err;
    }
    const record = { _id: `doc_${mockDb.size + 1}`, owner, filename, contentHash };
    mockDb.set(key, record);
    return record;
  }

  // User 1 uploads the syllabus
  const docUser1 = insertDocument("user_alice_123", "syllabus.pdf", sharedHash);
  assert.ok(docUser1, "User 1 must be able to upload the document");

  // User 1 re-uploads the exact same file -> rejected as duplicate
  assert.throws(
    () => insertDocument("user_alice_123", "syllabus_copy.pdf", sharedHash),
    (err) => err.code === 11000,
    "User 1 re-uploading same file must trigger per-user duplicate rejection"
  );

  // User 2 uploads the exact same file -> succeeds because owner is different
  const docUser2 = insertDocument("user_bob_456", "syllabus.pdf", sharedHash);
  assert.ok(docUser2, "User 2 must be permitted to upload the same shared syllabus");
  assert.notEqual(docUser1.owner, docUser2.owner, "Owners must remain isolated");
  assert.equal(docUser1.contentHash, docUser2.contentHash, "Both users reference identical content hash");
});
