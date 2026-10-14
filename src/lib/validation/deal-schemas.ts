import { z } from 'zod';
import { DEAL_LIMITS, REQUEST_LIMITS } from '@/config/collaboration';

/** Deal form schemas (FR-9), shared by the browser and server actions. */

const id = z.string().min(1).max(64);
const MAX_PERCENT = 100;
const REASON_MIN = 5;

export const dealTargetSchema = z.object({ dealId: id });

/** Blank → null, else a whole number within the range. */
const optionalWholeNumber = (max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d*$/, message)
    .transform((value) => (value === '' ? null : Number(value)))
    .refine((value) => value === null || value <= max, message);

/** FR-9.2: agreed amount and payment terms. */
export const dealTermsSchema = z.object({
  dealId: id,
  agreedAmountRupees: optionalWholeNumber(REQUEST_LIMITS.maxBudgetRupees, 'deal.invalidAmount'),
  advancePercent: optionalWholeNumber(MAX_PERCENT, 'deal.invalidPercent'),
  paymentDueOn: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'deal.invalidDueDate')
    .transform((value) => (value === '' ? null : value)),
});

const optionalNote = z.string().trim().max(DEAL_LIMITS.reasonMax, 'validation.tooLong');

export const contentNoteSchema = z.object({ dealId: id, note: optionalNote });

export const paymentDisputeSchema = z.object({ dealId: id, note: optionalNote });

/** UC-R6: a link to the published post. */
export const postLinkSchema = z.object({
  dealId: id,
  url: z
    .string()
    .trim()
    .max(DEAL_LIMITS.postUrlMax, 'validation.tooLong')
    .refine((value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        // Not a URL at all.
        return false;
      }
    }, 'deal.unknownLink'),
});

/** UC-R4: cancelling needs a reason the other side will see. */
export const cancelDealSchema = z.object({
  dealId: id,
  reason: z
    .string()
    .trim()
    .min(REASON_MIN, 'deal.reasonRequired')
    .max(DEAL_LIMITS.reasonMax, 'validation.tooLong'),
});
