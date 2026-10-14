import { z } from 'zod';
import { CREDIT_PACKS, type CreditPackCode, MAX_TRIAL_EXTENSION_DAYS } from '@/config/plans';

/** Admin console form schemas (FR-13), shared by the browser and server actions. */

const id = z.string().min(1).max(64);
const REASON_MIN = 5;
const REASON_MAX = 500;

export const PLAN_CODES = [
  'FREE_BETA',
  'TRIAL',
  'PAY_AS_YOU_GO',
  'STARTER',
  'PRO',
  'AGENCY',
] as const;

export const userTargetSchema = z.object({ userId: id });

/** A reason is required for actions against a user (audited, SEC-11). */
export const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, 'admin.reasonRequired')
  .max(REASON_MAX, 'validation.tooLong');

export const suspendUserSchema = z.object({ userId: id, reason: reasonSchema });

export const changePlanSchema = z.object({
  brandId: id,
  userId: id,
  planCode: z.enum(PLAN_CODES, 'validation.invalidChoice'),
});

export const extendTrialSchema = z.object({
  brandId: id,
  userId: id,
  days: z.coerce
    .number('plan.invalidExtension')
    .int('plan.invalidExtension')
    .min(1, 'plan.invalidExtension')
    .max(MAX_TRIAL_EXTENSION_DAYS, 'plan.invalidExtension'),
});

export const addCreditPackSchema = z.object({
  brandId: id,
  userId: id,
  packCode: z.custom<CreditPackCode>(
    (value) => CREDIT_PACKS.some((pack) => pack.code === value),
    'validation.invalidChoice',
  ),
});

export const freeBetaSchema = z.object({
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export const closeReportSchema = z.object({
  reportId: id,
  outcome: z.enum(['RESOLVED', 'DISMISSED']),
  note: reasonSchema,
});

export const ratingVisibilitySchema = z.object({
  ratingId: id,
  reportId: id,
  isHidden: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export const warnUserSchema = z.object({ userId: id, reportId: id, reason: reasonSchema });

export const openChatSchema = z.object({
  threadId: id,
  reportId: id.optional(),
  reason: reasonSchema,
});

export const reviewFlagSchema = z.object({
  flagId: id,
  decision: z.enum(['CLEARED', 'SUSPICIOUS']),
});

export const resolveDisputeSchema = z.object({
  disputeId: id,
  decision: z.enum(['TRANSFER', 'KEEP']),
  note: reasonSchema,
});

export const closeDataRequestSchema = z.object({
  requestId: id,
  outcome: z.enum(['COMPLETED', 'REJECTED']),
  resolution: reasonSchema,
});
