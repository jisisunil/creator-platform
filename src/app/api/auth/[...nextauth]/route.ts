import { handlers } from '@/lib/auth/authjs';

// Google OAuth handshake only (ADR-003). Our own sessions are created in the signIn callback.
export const { GET, POST } = handlers;
