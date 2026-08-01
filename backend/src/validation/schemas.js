import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(2000, "Message is too long."),
  mode: z.enum(["chat", "explain"]).optional(),
});

export const multiChatMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(2000, "Message is too long."),
  scope: z.string().trim().max(100).optional(),
});

export const summarySchema = z.object({
  style: z.enum(["short", "medium", "bullets", "exam"]).optional(),
});

export const flashcardsSchema = z.object({
  count: z.number().int().min(1).max(30).optional(),
});

export const reviewFlashcardSchema = z.object({
  quality: z.union([z.literal(0), z.literal(3), z.literal(4), z.literal(5)]),
});

export const quizSchema = z.object({
  mcq: z.number().int().min(0).max(20).optional(),
  trueFalse: z.number().int().min(0).max(20).optional(),
  shortAnswer: z.number().int().min(0).max(20).optional(),
});

export const searchSchema = z.object({
  query: z.string().trim().min(1, "A search query is required.").max(500),
  subject: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

// Shapes we require the LLM's JSON output to match before trusting it.
export const flashcardsResultSchema = z
  .array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
    })
  )
  .min(1);

export const quizResultSchema = z.object({
  mcq: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
        answer: z.string().min(1),
      })
    )
    .default([]),
  trueFalse: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.boolean(),
      })
    )
    .default([]),
  shortAnswer: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      })
    )
    .default([]),
});

export const studyPlanRequestSchema = z.object({
  subject: z.string().trim().max(100).optional(), // omitted/undefined = all subjects
  // Validated as a real date in the route (not here) rather than via a zod
  // date-format validator, to keep this simple and avoid relying on exact
  // zod date-string parsing edge cases.
  examDate: z.string().trim().max(30).optional(),
  days: z.number().int().min(1).max(60).optional(), // used when no examDate is given
  minutesPerDay: z.number().int().min(10).max(480).optional(),
});

// Shape we require the LLM's study-plan JSON to match before trusting it.
export const studyPlanResultSchema = z.object({
  planTitle: z.string().min(1),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1),
        subject: z.string().min(1),
        topics: z.array(z.string().min(1)).min(1),
        focus: z.string().min(1),
        estimatedMinutes: z.number().int().min(5).max(600),
      })
    )
    .min(1),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "A group name is required.").max(100),
  subject: z.string().trim().max(100).optional(),
});

export const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(1, "An invite code is required.").max(20),
});

export const shareToGroupSchema = z.object({
  // Same underlying risk as the route-param IDs (see validateObjectId.js) —
  // this pdfId arrives in the request body instead of a route param, so
  // router.param() can't catch it; the format check has to live in the
  // schema itself instead.
  pdfId: z
    .string()
    .trim()
    .min(1, "A PDF is required.")
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid PDF reference."),
});

export const groupChatMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(2000, "Message is too long."),
});