const { isValidEmail, isValidPhone, formatPhone } = require('../utils/validators');

describe('Input Validation Utilities', () => {
  describe('isValidEmail', () => {
    it('validates standard email addresses correctly', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.name+tag@sub.domain.co.in')).toBe(true);
      expect(isValidEmail('admin@plexis.in')).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('notanemail')).toBe(false);
      expect(isValidEmail('missingdomain@')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
      expect(isValidEmail('spaces in@domain.com')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false); // missing TLD
    });
  });

  describe('isValidPhone', () => {
    it('validates standard 10-digit Indian phone numbers', () => {
      expect(isValidPhone('9876543210')).toBe(true);
      expect(isValidPhone('8123456789')).toBe(true);
      expect(isValidPhone('7000000000')).toBe(true);
      expect(isValidPhone('6999999999')).toBe(true);
    });

    it('validates Indian numbers with prefix, spaces, and hyphens', () => {
      expect(isValidPhone('+91 9876543210')).toBe(true);
      expect(isValidPhone('+91-98765-43210')).toBe(true);
      expect(isValidPhone('919876543210')).toBe(true);
      expect(isValidPhone('09876543210')).toBe(true);
      expect(isValidPhone('+91 98765 43210')).toBe(true);
    });

    it('validates international E.164 phone numbers', () => {
      expect(isValidPhone('+14155552671')).toBe(true);
      expect(isValidPhone('+447911123456')).toBe(true);
      expect(isValidPhone('+971501234567')).toBe(true);
    });

    it('rejects invalid phone numbers', () => {
      expect(isValidPhone('')).toBe(false);
      expect(isValidPhone(null)).toBe(false);
      expect(isValidPhone(undefined)).toBe(false);
      expect(isValidPhone('12345')).toBe(false); // too short
      expect(isValidPhone('5123456789')).toBe(false); // starts with 5 (invalid Indian mobile)
      expect(isValidPhone('1234567890')).toBe(false); // starts with 1 without +
      expect(isValidPhone('abcdefghij')).toBe(false); // letters
      expect(isValidPhone('98765abcde')).toBe(false);
      expect(isValidPhone('98765432100000')).toBe(false); // too long without +
    });
  });

  describe('formatPhone', () => {
    it('formats 10-digit Indian numbers into standard +91 XXXXX XXXXX', () => {
      expect(formatPhone('9876543210')).toBe('+91 98765 43210');
      expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
      expect(formatPhone('919876543210')).toBe('+91 98765 43210');
      expect(formatPhone('09876543210')).toBe('+91 98765 43210');
      expect(formatPhone('+91 98765-43210')).toBe('+91 98765 43210');
    });

    it('preserves valid international numbers cleanly trimmed', () => {
      expect(formatPhone('+14155552671')).toBe('+14155552671');
      expect(formatPhone('+44 7911 123456')).toBe('+44 7911 123456');
    });

    it('handles empty or non-string inputs safely', () => {
      expect(formatPhone('')).toBe('');
      expect(formatPhone(null)).toBe('');
      expect(formatPhone(undefined)).toBe('');
    });
  });

  describe('Geo Utilities (geo.js)', () => {
    const { isValidCoordinate, calculateDistanceMeters, isWithinGeofence } = require('../utils/geo');

    it('validates coordinates within standard geographical bounds', () => {
      expect(isValidCoordinate(17.4722, 78.3728)).toBe(true);
      expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
      expect(isValidCoordinate(-90, -180)).toBe(true);
    });

    it('rejects invalid or out-of-bounds coordinates', () => {
      expect(isValidCoordinate(91, 78.3728)).toBe(false); // latitude > 90
      expect(isValidCoordinate(-95, 78.3728)).toBe(false); // latitude < -90
      expect(isValidCoordinate(17.4722, 185)).toBe(false); // longitude > 180
      expect(isValidCoordinate(NaN, 78.3728)).toBe(false);
      expect(isValidCoordinate('abc', 78.3728)).toBe(false);
      expect(isValidCoordinate(null, 78.3728)).toBe(false);
    });

    it('calculates accurate distance between coordinates', () => {
      // Distance between HICC Novotel (17.4722, 78.3728) and nearby spot (17.4725, 78.3730)
      const dist = calculateDistanceMeters(17.4722, 78.3728, 17.4725, 78.3730);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(100);
    });

    it('returns Infinity for invalid coordinates in distance calculation', () => {
      expect(calculateDistanceMeters('invalid', 78.3728, 17.4722, 78.3728)).toBe(Infinity);
      expect(calculateDistanceMeters(17.4722, 78.3728, 100, 78.3728)).toBe(Infinity);
    });

    it('correctly evaluates geofence boundaries', () => {
      // Exact same point
      const inside = isWithinGeofence(17.4722, 78.3728, 17.4722, 78.3728, 150);
      expect(inside.isWithin).toBe(true);
      expect(inside.distanceMeters).toBe(0);

      // Distant point (50 km away)
      const outside = isWithinGeofence(17.4722, 78.3728, 17.0000, 78.0000, 150);
      expect(outside.isWithin).toBe(false);
      expect(outside.distanceMeters).toBeGreaterThan(150);

      // Invalid coordinates safely return isWithin: false without NaN
      const invalid = isWithinGeofence('bad', 'coords', 17.4722, 78.3728, 150);
      expect(invalid.isWithin).toBe(false);
      expect(Number.isFinite(invalid.distanceMeters)).toBe(true);
    });
  });
});

