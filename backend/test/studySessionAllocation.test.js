import test, { mock } from "node:test";
import assert from "node:assert/strict";

let mockRankedResponse = null;

mock.module("../src/services/nextAction.js", {
  exports: {
    rankConcepts: async () => mockRankedResponse,
  },
});

const { buildStudySessionPlan } = await import("../src/services/studySession.js");

test("studySession: returns empty phases when course has no ranked concepts", async () => {
  mockRankedResponse = {
    course: { _id: "course1", title: "Biology 101" },
    ranked: [],
  };

  const plan = await buildStudySessionPlan({ userId: "u1", courseId: "course1", minutes: 30 });
  assert.equal(plan.totalMinutes, 30);
  assert.equal(plan.phases.length, 0);
});

test("studySession: targets weak prerequisite for PREREQUISITE_GAP", async () => {
  mockRankedResponse = {
    course: { _id: "course1", title: "Biology 101" },
    ranked: [
      {
        concept: { _id: "c_blocked", name: "Krebs Cycle" },
        type: "PREREQUISITE_GAP",
        mastery: 0.1,
        misconception: 0.1,
        prerequisite: {
          concept: { _id: "c_prereq", name: "Glycolysis" },
          mastery: 0.25,
        },
      },
      {
        concept: { _id: "c_other", name: "Cell Structure" },
        type: "PRACTICE",
        mastery: 0.7,
        misconception: 0.1,
      },
    ],
  };

  const plan = await buildStudySessionPlan({ userId: "u1", courseId: "course1", minutes: 30 });
  assert.ok(plan.phases.length > 0);

  const teachPhase = plan.phases.find((p) => p.phase === "teach");
  assert.ok(teachPhase, "Teach phase must exist");
  assert.equal(teachPhase.conceptId, "c_prereq", "Teach phase must target the prerequisite, not the blocked concept");
  assert.equal(teachPhase.conceptName, "Glycolysis");
  assert.equal(teachPhase.masteryBefore, 0.25);
});

test("studySession: allocated phase minutes sum up to total session minutes", async () => {
  mockRankedResponse = {
    course: { _id: "course1", title: "Biology 101" },
    ranked: [
      {
        concept: { _id: "c1", name: "Concept 1" },
        type: "TEACH",
        mastery: 0.2,
        misconception: 0.8, // trigger misconception fix phase
      },
      {
        concept: { _id: "c2", name: "Concept 2" },
        type: "PRACTICE",
        mastery: 0.8,
        misconception: 0.1,
      },
    ],
  };

  for (const targetMinutes of [15, 25, 45, 60]) {
    const plan = await buildStudySessionPlan({ userId: "u1", courseId: "course1", minutes: targetMinutes });
    const sumMinutes = plan.phases.reduce((sum, p) => sum + p.minutes, 0);
    assert.equal(sumMinutes, targetMinutes, `Sum of phase minutes should match total minutes (${targetMinutes})`);
  }
});
