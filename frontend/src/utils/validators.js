/**
 * Frontend Input validation utilities for Plexis CRM
 */

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return regex.test(email.trim());
}

export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // 1. Indian standard 10-digit (starts with 6,7,8,9) optionally with +91, 91, or 0
  const indianRegex = /^(?:\+91|91|0)?[6-9]\d{9}$/;
  if (indianRegex.test(cleaned)) return true;

  // 2. Standard international E.164 (+ followed by 10-15 digits)
  const intlRegex = /^\+[1-9]\d{9,14}$/;
  if (intlRegex.test(cleaned)) return true;

  return false;
}

export function formatPhone(phone) {
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
