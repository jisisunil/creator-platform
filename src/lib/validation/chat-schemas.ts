import { z } from 'zod';
import { CHAT_LIMITS, REPORT_REASON_MAX } from '@/config/collaboration';

/** Chat and report form schemas (FR-8), shared by the browser and server actions. */

const id = z.string().min(1).max(64);

/** The text part of a message; a message may be only an attachment (checked on the server). */
export const sendMessageSchema = z.object({
  threadId: id,
  body: z.string().max(CHAT_LIMITS.messageMax, 'validation.tooLong'),
});

const REPORT_REASON_MIN = 10;

export const reportSchema = z.object({
  threadId: id,
  reason: z
    .string()
    .trim()
    .min(REPORT_REASON_MIN, 'chat.reasonTooShort')
    .max(REPORT_REASON_MAX, 'validation.tooLong'),
});
