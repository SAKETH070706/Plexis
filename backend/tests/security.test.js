const request = require('supertest');
const { escapeRegex } = require('../utils/validators');
const { createRateLimiter } = require('../middleware/rateLimiter');

describe('Stage 5: Security & Vulnerability Hardening Tests', () => {
  describe('ReDoS & Regex Sanitization (escapeRegex)', () => {
    test('safely escapes regex control characters', () => {
      const dangerousInput = '.*+?^${}()|[]\\test(a+)+';
      const escaped = escapeRegex(dangerousInput);
      expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\test\\(a\\+\\)\\+');

      // Test that constructing a RegExp from the escaped string does not trigger unexpected execution
      const reg = new RegExp(escaped);
      expect(reg.test('.*+?^${}()|[]\\test(a+)+')).toBe(true);
      expect(reg.test('anything_else')).toBe(false);
    });

    test('handles empty or non-string inputs safely', () => {
      expect(escapeRegex('')).toBe('');
      expect(escapeRegex(null)).toBe('');
      expect(escapeRegex(undefined)).toBe('');
      expect(escapeRegex(123)).toBe('');
    });
  });

  describe('Rate Limiter Middleware', () => {
    test('allows requests within limit and throttles after max exceeded', () => {
      const limiter = createRateLimiter({ windowMs: 1000, max: 2, message: 'Too many requests' });
      const req = { path: '/test-route', ip: '192.168.1.100', socket: {} };
      const res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
      };

      // Temporarily override NODE_ENV to simulate non-test environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        let nextCalled = 0;
        const next = () => { nextCalled++; };

        // Req 1 - Allowed
        limiter(req, res, next);
        expect(nextCalled).toBe(1);

        // Req 2 - Allowed
        limiter(req, res, next);
        expect(nextCalled).toBe(2);

        // Req 3 - Throttled (429)
        limiter(req, res, next);
        expect(res.statusCode).toBe(429);
        expect(res.body.message).toBe('Too many requests');
        expect(res.headers['Retry-After']).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
