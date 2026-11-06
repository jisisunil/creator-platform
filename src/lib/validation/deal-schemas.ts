import { z } from 'zod';
import { DEAL_CONTRACT, DEAL_LIMITS, REQUEST_LIMITS, WORK_REVIEW } from '@/config/collaboration';

/** Deal form schemas (FR-9, ADR-012), shared by the browser and server actions. */

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

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    // Not a URL at all.
    return false;
  }
};

/**
 * FR-9.2 / ADR-012: the amount and payment terms, issued as a contract version: the
 * standard contract or the brand's own PDF (the file itself is checked by the service).
 */
export const issueContractSchema = z.object({
  dealId: id,
  amountRupees: z
    .string()
    .trim()
    .regex(/^\d+$/, 'deal.invalidAmount')
    .transform(Number)
    .refine((value) => value >= 1 && value <= REQUEST_LIMITS.maxBudgetRupees, 'deal.invalidAmount'),
  advancePercent: optionalWholeNumber(MAX_PERCENT, 'deal.invalidPercent'),
  paymentDueOn: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'deal.invalidDueDate')
    .transform((value) => (value === '' ? null : value)),
  additionalTerms: z.string().trim().max(DEAL_CONTRACT.additionalTermsMax, 'validation.tooLong'),
  source: z.enum(['GENERATED', 'UPLOADED']),
});

/** ADR-012: accepting names the exact version read (its SHA-256 fingerprint). */
export const acceptContractSchema = z.object({
  dealId: id,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  hasAgreed: z.literal('on', { message: 'contract.mustAgree' }),
});

/** ADR-012: proof of work: a note and links (one per line); files are checked by the service. */
export const submitWorkSchema = z.object({
  dealId: id,
  note: z.string().trim().max(WORK_REVIEW.noteMax, 'validation.tooLong'),
  links: z
    .string()
    .transform((value) =>
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
    .refine((links) => links.length <= WORK_REVIEW.linksMax, 'work.tooManyLinks')
    .refine(
      (links) => links.every((link) => link.length <= WORK_REVIEW.linkMax && isHttpsUrl(link)),
      'work.invalidLink',
    ),
});

/** ADR-012: asking for changes, or raising a dispute, says why. */
export const reviewNoteSchema = z.object({
  dealId: id,
  note: z
    .string()
    .trim()
    .min(REASON_MIN, 'deal.reasonRequired')
    .max(DEAL_LIMITS.reasonMax, 'validation.tooLong'),
});

const optionalNote = z.string().trim().max(DEAL_LIMITS.reasonMax, 'validation.tooLong');

export const paymentDisputeSchema = z.object({ dealId: id, note: optionalNote });

/** UC-R6: a link to the published post. */
export const postLinkSchema = z.object({
  dealId: id,
  url: z
    .string()
    .trim()
    .max(DEAL_LIMITS.postUrlMax, 'validation.tooLong')
    .refine(isHttpsUrl, 'deal.unknownLink'),
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
