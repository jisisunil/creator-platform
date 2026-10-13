import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/config/auth';

export type PasswordProblem = 'tooShort' | 'tooLong' | 'containsEmail';

const MIN_EMAIL_LOCAL_PART_TO_CHECK = 4;

/**
 * Local password rules (SR-1). The breached-password check is separate because it needs
 * an external lookup. Returns null when the password is acceptable.
 */
export function findPasswordProblem(password: string, email: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'tooShort';
  if (password.length > PASSWORD_MAX_LENGTH) return 'tooLong';
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  const isLocalPartLongEnough = localPart.length >= MIN_EMAIL_LOCAL_PART_TO_CHECK;
  if (isLocalPartLongEnough && password.toLowerCase().includes(localPart)) return 'containsEmail';
  return null;
}
