import { z } from 'zod';

/** FR-12.2: the "CATEGORY:CHANNEL" pairs left switched on (ticked checkboxes). */
export const notificationPreferencesSchema = z.object({
  enabled: z.preprocess(
    (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
    z.array(z.string().regex(/^[A-Z_]{1,20}:[A-Z_]{1,10}$/)).max(20),
  ),
});
