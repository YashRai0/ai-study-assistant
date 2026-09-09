// Performance monitoring service

let metrics = {
  requestCount: 0,
  totalResponseTime: 0,
  errors: 0,
  startTime: Date.now(),
};

export function recordRequest(duration, error = false) {
  metrics.requestCount++;
  metrics.totalResponseTime += duration;
  if (error) metrics.errors++;
}

export function getMetrics() {
  const uptime = Date.now() - metrics.startTime;
  const avgResponseTime = metrics.requestCount > 0 
    ? (metrics.totalResponseTime / metrics.requestCount).toFixed(2)
    : 0;

  return {
    uptime: Math.floor(uptime / 1000), // seconds
    requests: metrics.requestCount,
    avgResponseTime: `${avgResponseTime}ms`,
    errorRate: metrics.requestCount > 0 
      ? ((metrics.errors / metrics.requestCount) * 100).toFixed(2) + "%"
      : "0%",
    memoryUsage: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB",
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
  };
}

// Middleware to track requests
export function performanceMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const isError = res.statusCode >= 400;
      recordRequest(duration, isError);

      // Log slow requests
      if (duration > 1000) {
        console.warn(`Slow request: ${req.method} ${req.path} - ${duration}ms`);
      }
    });

    next();
  };
}
