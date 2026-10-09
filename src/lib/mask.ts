/** Masks an email for logs: "priya.sharma@example.com" → "p***@example.com". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.charAt(0)}***${email.slice(at)}`;
}

/** Masks a phone number for logs, keeping only the last two digits. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 2 ? '***' : `***${digits.slice(-2)}`;
}
