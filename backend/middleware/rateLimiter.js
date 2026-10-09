/**
 * Lightweight in-memory rate limiter for sensitive endpoints
 */
const rateLimitMap = new Map();

// Periodic cleanup every 10 minutes to avoid memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 50,
  message = 'Too many requests, please try again later',
} = {}) {
  return (req, res, next) => {
    // Skip in test environment to prevent flaky automated test runs
    if (process.env.NODE_ENV === 'test') return next();

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();

    const record = rateLimitMap.get(key);

    if (!record || now > record.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ message, retryAfter });
    }

    record.count++;
    next();
  };
}

module.exports = { createRateLimiter };
