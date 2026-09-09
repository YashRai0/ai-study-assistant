import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

router.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: "unknown",
      memory: "ok",
    },
  };

  // Check database
  try {
    await mongoose.connection.db.admin().ping();
    health.checks.database = "ok";
  } catch {
    health.checks.database = "error";
    health.status = "degraded";
  }

  // Check memory usage. Higher (worse) threshold checked first — checking
  // >90 before >95 would make the >95 branch unreachable, since anything
  // above 95 is already above 90 and gets caught by the first branch.
  const memUsage = process.memoryUsage();
  const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  if (heapUsedPercent > 95) {
    health.checks.memory = "error";
    health.status = "unhealthy";
  } else if (heapUsedPercent > 90) {
    health.checks.memory = "warning";
    if (health.status === "ok") health.status = "degraded";
  }

  health.memory = {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB",
    percentUsed: Math.round(heapUsedPercent) + "%",
  };

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
