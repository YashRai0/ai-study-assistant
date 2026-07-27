import { Router } from "express";
import crypto from "crypto";
import { embedText } from "../services/embeddings.js";
import { retrieveTopK, bestScore, SIMILARITY_THRESHOLD } from "../services/vectorStore.js";
import { streamAnswerAcrossNotes } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import {
  createGroupSchema,
  joinGroupSchema,
  shareToGroupSchema,
  groupChatMessageSchema,
} from "../validation/schemas.js";
import StudyGroup from "../models/StudyGroup.js";
import GroupMembership from "../models/GroupMembership.js";
import GroupPdfShare from "../models/GroupPdfShare.js";
import GroupChatMessage from "../models/GroupChatMessage.js";
import Pdf from "../models/Pdf.js";
import Chunk from "../models/Chunk.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);

function generateInviteCode() {
  // 6 uppercase alphanumeric chars, no ambiguous 0/O/1/I — easy to read aloud
  // or type in, which matters since this is meant to be shared verbally or
  // typed into a join box, not just clicked as a link.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

// Loads the caller's membership for :groupId and attaches it to the request,
// or responds 403/404 — shared by every route below that operates on a
// specific group, so membership is checked exactly once per request.
async function requireMembership(req, res, next) {
  const group = await StudyGroup.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Study group not found." });

  const membership = await GroupMembership.findOne({ group: group._id, user: req.user.id });
  if (!membership) return res.status(403).json({ error: "You're not a member of this study group." });

  req.group = group;
  req.membership = membership;
  next();
}

router.post("/", validate(createGroupSchema), async (req, res) => {
  const { name, subject } = req.body;

  try {
    let inviteCode;
    // Extremely unlikely to collide at 6 chars from a 32-symbol alphabet,
    // but check anyway rather than assume.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      if (!(await StudyGroup.findOne({ inviteCode: candidate }))) {
        inviteCode = candidate;
        break;
      }
    }
    if (!inviteCode) {
      return res.status(500).json({ error: "Couldn't generate a unique invite code. Please try again." });
    }

    const group = await StudyGroup.create({
      name,
      subject: subject || "General",
      owner: req.user.id,
      inviteCode,
    });
    await GroupMembership.create({ group: group._id, user: req.user.id, role: "owner" });

    res.status(201).json({ group });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Create group error");
    res.status(500).json({ error: "Couldn't create the study group right now. Please try again." });
  }
});

router.post("/join", validate(joinGroupSchema), async (req, res) => {
  const { inviteCode } = req.body;

  const group = await StudyGroup.findOne({ inviteCode: inviteCode.toUpperCase() });
  if (!group) return res.status(404).json({ error: "No study group found with that invite code." });

  const existing = await GroupMembership.findOne({ group: group._id, user: req.user.id });
  if (existing) return res.status(200).json({ group, alreadyMember: true });

  await GroupMembership.create({ group: group._id, user: req.user.id, role: "member" });
  res.status(201).json({ group });
});

router.get("/", async (req, res) => {
  const memberships = await GroupMembership.find({ user: req.user.id }).populate("group");
  res.json({
    groups: memberships
      .filter((m) => m.group) // guard against a dangling membership if a group was ever deleted without cleanup
      .map((m) => ({
        id: m.group._id,
        name: m.group.name,
        subject: m.group.subject,
        role: m.role,
        inviteCode: m.group.inviteCode,
      })),
  });
});

router.get("/:groupId", requireMembership, async (req, res) => {
  res.json({
    group: {
      id: req.group._id,
      name: req.group.name,
      subject: req.group.subject,
      inviteCode: req.group.inviteCode,
      role: req.membership.role,
    },
  });
});

router.get("/:groupId/members", requireMembership, async (req, res) => {
  const memberships = await GroupMembership.find({ group: req.group._id }).populate("user", "email");
  res.json({
    members: memberships.map((m) => ({
      email: m.user?.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
});

router.post("/:groupId/share", requireMembership, validate(shareToGroupSchema), async (req, res) => {
  const { pdfId } = req.body;

  const pdf = await Pdf.findOne({ _id: pdfId, owner: req.user.id }).select("_id filename subject");
  if (!pdf) return res.status(404).json({ error: "PDF not found in your notes." });

  try {
    await GroupPdfShare.create({ group: req.group._id, pdf: pdf._id, sharedBy: req.user.id });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "This PDF is already shared with this group." });
    }
    logger.error({ reqId: req.id, err }, "Share to group error");
    res.status(500).json({ error: "Couldn't share this PDF right now. Please try again." });
  }
});

router.get("/:groupId/pdfs", requireMembership, async (req, res) => {
  const shares = await GroupPdfShare.find({ group: req.group._id })
    .populate("pdf", "filename subject")
    .populate("sharedBy", "email");
  res.json({
    pdfs: shares
      .filter((s) => s.pdf) // guard against a dangling share if the original PDF was deleted
      .map((s) => ({
        pdfId: s.pdf._id,
        filename: s.pdf.filename,
        subject: s.pdf.subject,
        sharedBy: s.sharedBy?.email,
        sharedAt: s.sharedAt,
      })),
  });
});

router.delete("/:groupId/share/:pdfId", requireMembership, async (req, res) => {
  const share = await GroupPdfShare.findOne({ group: req.group._id, pdf: req.params.pdfId });
  if (!share) return res.status(404).json({ error: "This PDF isn't shared with this group." });

  // Only the person who shared it, or the group owner, can unshare it.
  if (String(share.sharedBy) !== req.user.id && req.membership.role !== "owner") {
    return res.status(403).json({ error: "Only the person who shared this, or the group owner, can remove it." });
  }

  await GroupPdfShare.deleteOne({ _id: share._id });
  res.json({ ok: true });
});

// Shared group chat: grounded in every PDF any member has shared to this
// group — same SSE streaming pattern as chat.js/multiChat.js.
router.post("/:groupId/chat", requireMembership, aiLimiter, validate(groupChatMessageSchema), async (req, res) => {
  const { message } = req.body;

  try {
    const shares = await GroupPdfShare.find({ group: req.group._id }).select("pdf");
    const pdfIds = shares.map((s) => s.pdf);

    if (pdfIds.length === 0) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const answer = "No notes have been shared with this group yet — share a PDF first.";
      res.write(`data: ${JSON.stringify({ token: answer })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      await GroupChatMessage.create({ group: req.group._id, author: req.user.id, role: "user", content: message });
      await GroupChatMessage.create({ group: req.group._id, author: req.user.id, role: "assistant", content: answer });
      return;
    }

    const chunks = await Chunk.find({ pdf: { $in: pdfIds } }).select("text page filename subject embedding").lean();
    const queryEmbedding = await embedText(message);
    const topChunks = retrieveTopK(chunks, queryEmbedding, 6);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const sendToken = (token) => res.write(`data: ${JSON.stringify({ token })}\n\n`);

    let fullAnswer;
    if (bestScore(topChunks) < SIMILARITY_THRESHOLD) {
      fullAnswer = "I couldn't find this information in the notes shared with this group.";
      sendToken(fullAnswer);
    } else {
      fullAnswer = await streamAnswerAcrossNotes(message, topChunks, sendToken);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    await GroupChatMessage.create({ group: req.group._id, author: req.user.id, role: "user", content: message });
    await GroupChatMessage.create({ group: req.group._id, author: req.user.id, role: "assistant", content: fullAnswer });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Group chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't generate an answer right now. Please try again." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong while generating the answer." })}\n\n`);
      res.end();
    }
  }
});

router.get("/:groupId/chat/history", requireMembership, async (req, res) => {
  const history = await GroupChatMessage.find({ group: req.group._id })
    .sort({ ts: 1 })
    .limit(500)
    .populate("author", "email");
  res.json({
    history: history.map((m) => ({
      role: m.role,
      content: m.content,
      ts: m.ts,
      author: m.role === "user" ? m.author?.email : undefined,
    })),
  });
});

// Leaving: any member except the owner can leave directly. The owner must
// delete the group instead of leaving it, to avoid an ownerless group.
router.delete("/:groupId/leave", requireMembership, async (req, res) => {
  if (req.membership.role === "owner") {
    return res.status(400).json({
      error: "As the group owner, you can't leave — delete the group instead if you want to disband it.",
    });
  }
  await GroupMembership.deleteOne({ _id: req.membership._id });
  res.json({ ok: true });
});

// Deleting: owner-only, cascades memberships/shares/chat history.
router.delete("/:groupId", requireMembership, async (req, res) => {
  if (req.membership.role !== "owner") {
    return res.status(403).json({ error: "Only the group owner can delete this group." });
  }

  await StudyGroup.deleteOne({ _id: req.group._id });
  await GroupMembership.deleteMany({ group: req.group._id });
  await GroupPdfShare.deleteMany({ group: req.group._id });
  await GroupChatMessage.deleteMany({ group: req.group._id });

  res.json({ ok: true });
});

export default router;
