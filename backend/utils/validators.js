/**
 * Input validation utilities for Plexis CRM
 */

/**
 * Validates email format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Validates phone numbers:
 * Supports:
 * - 10-digit Indian numbers starting with 6, 7, 8, or 9 (e.g., 9876543210)
 * - Numbers with country code (e.g., +91 9876543210, +91-9876543210, 919876543210, 09876543210)
 * - Standard international format (+1 4155552671, +44 7911123456)
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // 1. Indian standard 10-digit or with +91/91/0 prefix:
  // e.g., 9876543210, +919876543210, 919876543210, 09876543210
  const indianRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
  if (indianRegex.test(cleaned)) return true;

  // 2. Standard international E.164 (+ followed by 10 to 15 digits)
  const intlRegex = /^\+[1-9]\d{9,14}$/;
  if (intlRegex.test(cleaned)) return true;

  return false;
}

/**
 * Formats a valid Indian or international phone number neatly
 * @param {string} phone
 * @returns {string}
 */
function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (/^(?:\+91|91)[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.replace(/^\+?91/, '');
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.slice(1);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  return phone.trim();
}

/**
 * Escapes characters with special meaning in regular expressions
 * to prevent ReDoS or unintended pattern matching in search queries
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  isValidEmail,
  isValidPhone,
  formatPhone,
  escapeRegex,
};
