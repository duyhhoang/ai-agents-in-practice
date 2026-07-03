import { Request, Response, NextFunction } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message?: string;
};

/**
 * Memory-efficient sliding-window rate limiter middleware for Express.
 * Protects MCP transport endpoints (/sse, /messages) and REST endpoints against burst traffic and DDoS attacks.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests from this IP, please try again later." } = options;
  const requests = new Map<string, number[]>();

  // Cleanup expired timestamps every 60s
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of requests.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, valid);
      }
    }
  }, 60000);
  if (timer.unref) timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const now = Date.now();
    const timestamps = requests.get(ip) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= max) {
      res.status(429).json({
        error: message,
        retryAfterMs: Math.max(0, windowMs - (now - validTimestamps[0]))
      });
      return;
    }

    validTimestamps.push(now);
    requests.set(ip, validTimestamps);
    next();
  };
}
