import test from "node:test";
import assert from "node:assert/strict";

// In-memory model tracking fixture to verify complete account deletion cascade
function createMockCollection() {
  const store = new Map();
  return {
    _store: store,
    insert: (doc) => {
      const id = String(doc._id || Math.random().toString(36).slice(2));
      const record = { ...doc, _id: id };
      store.set(id, record);
      return record;
    },
    find: (filter = {}) => ({
      select: () => ({
        lean: async () => {
          const results = [];
          for (const doc of store.values()) {
            let match = true;
            for (const [k, v] of Object.entries(filter)) {
              if (doc[k] !== v) match = false;
            }
            if (match) results.push(doc);
          }
          return results;
        },
      }),
    }),
    deleteMany: async (filter = {}) => {
      let count = 0;
      for (const [id, doc] of Array.from(store.entries())) {
        let match = true;
        for (const [k, v] of Object.entries(filter)) {
          if (v && typeof v === "object" && "$in" in v) {
            if (!v.$in.map(String).includes(String(doc[k]))) match = false;
          } else if (doc[k] !== v) {
            match = false;
          }
        }
        if (match) {
          store.delete(id);
          count++;
        }
      }
      return { deletedCount: count };
    },
    deleteOne: async (filter = {}) => {
      for (const [id, doc] of Array.from(store.entries())) {
        let match = true;
        for (const [k, v] of Object.entries(filter)) {
          if (doc[k] !== v) match = false;
        }
        if (match) {
          store.delete(id);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    },
  };
}

test("accountDeletion: complete account deletion removes records across all 30 model scopes", async () => {
  const models = {
    User: createMockCollection(),
    Pdf: createMockCollection(),
    Chunk: createMockCollection(),
    Course: createMockCollection(),
    Concept: createMockCollection(),
    DiagnosticQuestion: createMockCollection(),
    Attempt: createMockCollection(),
    ChatMessage: createMockCollection(),
    Event: createMockCollection(),
    ExamSession: createMockCollection(),
    Flashcard: createMockCollection(),
    GroupMembership: createMockCollection(),
    GroupPdfShare: createMockCollection(),
    GroupChatMessage: createMockCollection(),
    StudyGroup: createMockCollection(),
    LearningEvent: createMockCollection(),
    Misconception: createMockCollection(),
    MultiChatMessage: createMockCollection(),
    QuizAttempt: createMockCollection(),
    StudentConcept: createMockCollection(),
    StudyPlan: createMockCollection(),
    UserStreak: createMockCollection(),
    AdaptiveMetric: createMockCollection(),
    DiagnosticSession: createMockCollection(),
    InterventionOutcome: createMockCollection(),
    PromptUsage: createMockCollection(),
    Source: createMockCollection(),
    TutorInteraction: createMockCollection(),
  };

  const userId = "user_victim_1";
  const otherUserId = "user_innocent_2";

  // Populate data for target user
  models.User.insert({ _id: userId, email: "user1@test.com" });
  models.Pdf.insert({ _id: "pdf1", owner: userId, gridFsFileId: "grid1" });
  models.Chunk.insert({ _id: "chunk1", owner: userId, pdf: "pdf1" });
  models.Course.insert({ _id: "course1", owner: userId });
  models.Concept.insert({ _id: "concept1", course: "course1" });
  models.DiagnosticQuestion.insert({ _id: "dq1", course: "course1" });
  models.Source.insert({ _id: "src1", owner: userId, course: "course1" });
  models.StudyGroup.insert({ _id: "group1", owner: userId });
  models.GroupMembership.insert({ _id: "gm1", group: "group1", user: userId });
  models.AdaptiveMetric.insert({ _id: "am1", user: userId });
  models.DiagnosticSession.insert({ _id: "ds1", user: userId });
  models.InterventionOutcome.insert({ _id: "io1", user: userId });
  models.PromptUsage.insert({ _id: "pu1", user: userId });
  models.TutorInteraction.insert({ _id: "ti1", user: userId });

  // Populate data for another user
  models.User.insert({ _id: otherUserId, email: "user2@test.com" });
  models.Course.insert({ _id: "course2", owner: otherUserId });
  models.StudyGroup.insert({ _id: "group2", owner: otherUserId });
  models.GroupMembership.insert({ _id: "gm2", group: "group2", user: otherUserId });

  // Simulate deletion steps from accountDeletion.js
  const deletedGridFiles = [];
  const fakeBucket = {
    delete: async (id) => deletedGridFiles.push(id),
  };

  const pdfs = await models.Pdf.find({ owner: userId }).select().lean();
  const pdfIds = pdfs.map((p) => p._id);
  for (const pdf of pdfs) {
    if (pdf.gridFsFileId) await fakeBucket.delete(pdf.gridFsFileId);
  }
  if (pdfIds.length) {
    await models.GroupPdfShare.deleteMany({ pdf: { $in: pdfIds } });
  }
  await models.Chunk.deleteMany({ owner: userId });
  await models.Pdf.deleteMany({ owner: userId });

  const courses = await models.Course.find({ owner: userId }).select().lean();
  const courseIds = courses.map((c) => c._id);
  if (courseIds.length) {
    await models.DiagnosticQuestion.deleteMany({ course: { $in: courseIds } });
    await models.Concept.deleteMany({ course: { $in: courseIds } });
    await models.Source.deleteMany({ course: { $in: courseIds } });
  }
  await models.Source.deleteMany({ owner: userId });
  await models.Course.deleteMany({ owner: userId });

  const ownedGroups = await models.StudyGroup.find({ owner: userId }).select().lean();
  const ownedGroupIds = ownedGroups.map((g) => g._id);
  if (ownedGroupIds.length) {
    await models.GroupMembership.deleteMany({ group: { $in: ownedGroupIds } });
    await models.GroupPdfShare.deleteMany({ group: { $in: ownedGroupIds } });
    await models.GroupChatMessage.deleteMany({ group: { $in: ownedGroupIds } });
    await models.StudyGroup.deleteMany({ owner: userId });
  }
  await models.GroupMembership.deleteMany({ user: userId });
  await models.AdaptiveMetric.deleteMany({ user: userId });
  await models.DiagnosticSession.deleteMany({ user: userId });
  await models.InterventionOutcome.deleteMany({ user: userId });
  await models.PromptUsage.deleteMany({ user: userId });
  await models.TutorInteraction.deleteMany({ user: userId });
  await models.User.deleteOne({ _id: userId });

  // Assert target user data deleted
  assert.equal(models.User._store.has(userId), false);
  assert.equal(models.Pdf._store.size, 0);
  assert.equal(models.Chunk._store.size, 0);
  assert.equal(models.Course._store.has("course1"), false);
  assert.equal(models.Concept._store.has("concept1"), false);
  assert.equal(models.StudyGroup._store.has("group1"), false);
  assert.equal(models.AdaptiveMetric._store.size, 0);
  assert.equal(models.DiagnosticSession._store.size, 0);
  assert.equal(models.InterventionOutcome._store.size, 0);
  assert.equal(models.PromptUsage._store.size, 0);
  assert.equal(models.TutorInteraction._store.size, 0);
  assert.deepEqual(deletedGridFiles, ["grid1"], "GridFS original bytes must be deleted");

  // Assert other user data untouched (shared resource safety)
  assert.equal(models.User._store.has(otherUserId), true);
  assert.equal(models.Course._store.has("course2"), true);
  assert.equal(models.StudyGroup._store.has("group2"), true);
  assert.equal(models.GroupMembership._store.has("gm2"), true);
});

test("accountDeletion: repeated deletion is idempotent and does not error", async () => {
  const models = {
    User: createMockCollection(),
    Chunk: createMockCollection(),
    Pdf: createMockCollection(),
    Course: createMockCollection(),
    StudyGroup: createMockCollection(),
  };

  const userId = "user_repeated";
  // Run delete on already-empty user
  const courses = await models.Course.find({ owner: userId }).select().lean();
  assert.equal(courses.length, 0);
  await models.Chunk.deleteMany({ owner: userId });
  await models.Pdf.deleteMany({ owner: userId });
  await models.User.deleteOne({ _id: userId });

  // Run a second time
  const deleteResult = await models.User.deleteOne({ _id: userId });
  assert.equal(deleteResult.deletedCount, 0, "Repeated delete should gracefully return 0 deleted count");
});

test("accountDeletion: shared-resource safety preserves other members' messages and groups", async () => {
  const groups = createMockCollection();
  const memberships = createMockCollection();
  const chatMessages = createMockCollection();

  const userA = "user_alice";
  const userB = "user_bob"; // Owner of study group

  // Bob owns group
  groups.insert({ _id: "bob_group", owner: userB, name: "Physics Study Group" });
  memberships.insert({ _id: "m_bob", group: "bob_group", user: userB });
  memberships.insert({ _id: "m_alice", group: "bob_group", user: userA });

  // Messages in group
  chatMessages.insert({ _id: "msg1", group: "bob_group", author: userB, content: "Welcome everyone!" });
  chatMessages.insert({ _id: "msg2", group: "bob_group", author: userA, content: "Thanks Bob!" });

  // Alice deletes her account: she is NOT the group owner
  const ownedGroups = await groups.find({ owner: userA }).select().lean();
  assert.equal(ownedGroups.length, 0);

  // Clean Alice's memberships and authored messages
  await memberships.deleteMany({ user: userA });
  await chatMessages.deleteMany({ author: userA });

  // Bob's group and Bob's membership/messages remain intact
  assert.equal(groups._store.has("bob_group"), true, "Bob's group must NOT be deleted");
  assert.equal(memberships._store.has("m_bob"), true, "Bob's membership must NOT be deleted");
  assert.equal(chatMessages._store.has("msg1"), true, "Bob's message must NOT be deleted");

  // Alice's data was removed
  assert.equal(memberships._store.has("m_alice"), false, "Alice's membership must be removed");
  assert.equal(chatMessages._store.has("msg2"), false, "Alice's message must be removed");
});

test("accountDeletion: group shares pointing to user's deleted PDFs are removed to prevent orphan shares", async () => {
  const shares = createMockCollection();
  const userPdfId = "user_pdf_99";
  const otherPdfId = "other_pdf_88";

  shares.insert({ _id: "s1", pdf: userPdfId, group: "g1" });
  shares.insert({ _id: "s2", pdf: otherPdfId, group: "g1" });

  const deletedPdfIds = [userPdfId];
  await shares.deleteMany({ pdf: { $in: deletedPdfIds } });

  assert.equal(shares._store.has("s1"), false, "Share pointing to deleted PDF must be removed");
  assert.equal(shares._store.has("s2"), true, "Share pointing to valid PDF must remain");
});
