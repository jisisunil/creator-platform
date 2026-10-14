import { z } from 'zod';
import { SHORTLIST_NAME_MAX, SHORTLIST_NOTE_MAX } from '@/config/search';

/** Shortlist and saved-search form schemas (FR-5.4, FR-6), shared by browser and server. */

const id = z.string().min(1).max(64);

export const shortlistNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(SHORTLIST_NAME_MAX, 'validation.tooLong'),
});

export const renameShortlistSchema = shortlistNameSchema.extend({ shortlistId: id });

export const shortlistTargetSchema = z.object({ shortlistId: id });

export const addToShortlistSchema = z.object({ shortlistId: id, creatorId: id });

export const shortlistItemSchema = z.object({ shortlistId: id, itemId: id });

export const shortlistNoteSchema = shortlistItemSchema.extend({
  note: z.string().trim().max(SHORTLIST_NOTE_MAX, 'validation.tooLong'),
});

export const shortlistShareSchema = z.object({
  shortlistId: id,
  isShared: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export const savedSearchTargetSchema = z.object({ savedSearchId: id });
