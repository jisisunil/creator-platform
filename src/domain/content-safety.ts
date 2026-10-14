/**
 * UC-C1: bios must not carry contact details (brands contact creators through the
 * platform, SR-12) or profanity. FR-8.2 reuses the contact detection for chat.
 */

export type ContactDetailKind = 'EMAIL' | 'PHONE' | 'LINK';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Indian mobile numbers with optional +91/0 prefix and common separators, or any 10+ digit run.
const PHONE_PATTERN = /(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}\b|\b\d(?:[\s-]?\d){9,}\b/;
const LINK_PATTERN =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|io|me|co|link|ly)\b(?:\/\S*)?/i;
// "Dot" and "at" spelt out to dodge filters.
const OBFUSCATED_EMAIL_PATTERN = /\b\w+\s*[[(]?\s*at\s*[\])]?\s*\w+\s*[[(]?\s*dot\s*[\])]?\s*\w+/i;

/** Every kind of contact detail found in the text. */
export function findContactDetails(text: string): ContactDetailKind[] {
  const kinds: ContactDetailKind[] = [];
  if (EMAIL_PATTERN.test(text) || OBFUSCATED_EMAIL_PATTERN.test(text)) kinds.push('EMAIL');
  if (PHONE_PATTERN.test(text)) kinds.push('PHONE');
  if (LINK_PATTERN.test(text) && !EMAIL_PATTERN.test(text)) kinds.push('LINK');
  return kinds;
}

// A deliberately short list of unambiguous slurs and profanity in English and Hindi
// (romanised and Devanagari). It catches the obvious; reports handle the rest (FR-8.3).
const BLOCKED_WORDS: readonly string[] = [
  'fuck',
  'fucking',
  'motherfucker',
  'bitch',
  'cunt',
  'bastard',
  'madarchod',
  'behenchod',
  'bhenchod',
  'chutiya',
  'bhosdike',
  'randi',
  'gandu',
  'मादरचोद',
  'बहनचोद',
  'चूतिया',
  'भोसड़ी',
  'रंडी',
  'गांडू',
];

/** True when the text contains a blocked word (whole-word match, any case). */
export function containsProfanity(text: string): boolean {
  const words = text.toLowerCase().split(/[^\p{L}\p{M}]+/u);
  return words.some((word) => BLOCKED_WORDS.includes(word));
}
