import { z } from 'zod';
import { REQUEST_LIMITS } from '@/config/collaboration';
import { DELIVERABLES, type DeliverableLine, USAGE_RIGHTS } from '@/domain/requests';

/**
 * Collaboration request schemas (FR-7), shared by the browser and server actions.
 * Messages are i18n keys under `fieldErrors`.
 */

const id = z.string().min(1).max(64);

/** A blank or whole-number quantity for one deliverable type. */
const quantity = z
  .string()
  .trim()
  .regex(/^\d*$/, 'request.invalidQuantity')
  .transform((value) => (value === '' ? 0 : Number(value)))
  .refine((value) => value <= REQUEST_LIMITS.maxQuantityPerLine, 'request.invalidQuantity');

/** The request fields the brand fills in (UC-R1); shared by "send" and "edit". */
export const requestFieldsSchema = z
  .object({
    campaignName: z
      .string()
      .trim()
      .min(1, 'validation.required')
      .max(REQUEST_LIMITS.campaignNameMax, 'validation.tooLong'),
    brief: z
      .string()
      .trim()
      .min(REQUEST_LIMITS.briefMin, 'request.briefTooShort')
      .max(REQUEST_LIMITS.briefMax, 'validation.tooLong'),
    REEL: quantity,
    STORY: quantity,
    VIDEO: quantity,
    POST: quantity,
    budgetRupees: z
      .string()
      .trim()
      .regex(/^\d*$/, 'request.invalidBudget')
      .transform((value) => (value === '' ? null : Number(value)))
      .refine(
        (value) => value === null || (value > 0 && value <= REQUEST_LIMITS.maxBudgetRupees),
        'request.invalidBudget',
      ),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'request.invalidDeadline'),
    usageRights: z.enum(USAGE_RIGHTS, 'validation.invalidChoice'),
  })
  .refine((fields) => DELIVERABLES.some((type) => fields[type] > 0), {
    message: 'request.noDeliverables',
    path: ['deliverables'],
  });

export type RequestFields = z.infer<typeof requestFieldsSchema>;

/** The deliverable lines with a quantity, in a fixed order. */
export function deliverableLinesFrom(fields: RequestFields): DeliverableLine[] {
  return DELIVERABLES.filter((type) => fields[type] > 0).map((type) => ({
    deliverable: type,
    quantity: fields[type],
  }));
}

export const sendRequestSchema = z.intersection(z.object({ creatorId: id }), requestFieldsSchema);

export const editRequestSchema = z.intersection(z.object({ requestId: id }), requestFieldsSchema);

export const requestTargetSchema = z.object({ requestId: id });

/** UC-R2: the creator answers the version they saw. */
export const respondToRequestSchema = z.object({
  requestId: id,
  version: z.coerce.number().int().min(1),
  decision: z.enum(['accept', 'decline']),
  reason: z.string().trim().max(REQUEST_LIMITS.declineReasonMax, 'validation.tooLong').optional(),
});

/** FR-8.3: block or unblock the other side of a request. */
export const blockToggleSchema = z.object({
  requestId: id,
  isBlocked: z.enum(['true', 'false']).transform((value) => value === 'true'),
});
