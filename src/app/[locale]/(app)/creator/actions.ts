'use server';

import { getLocale } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { validationFailed } from '@/domain/errors';
import { type ActionState, runAction } from '@/lib/action';
import { requireActionSession } from '@/lib/auth/current-session';
import { targetIdSchema } from '@/lib/validation/account-schemas';
import {
  availabilitySchema,
  channelLinkSchema,
  chooseAccountSchema,
  portfolioItemSchema,
  profileDetailsSchema,
  rateCardSchema,
} from '@/lib/validation/creator-schemas';
import { parseForm } from '@/lib/validation/form-data';
import {
  addPortfolioItem,
  removePortfolioItem,
  setAvailability,
  updateProfileDetails,
  updateRateCard,
  uploadProfilePhoto,
} from '@/services/creators';
import {
  choosePendingAccount,
  type ConnectionOutcome,
  connectPublicChannel,
  disconnectAccount,
} from '@/services/social';

const creatorOnly = () => requireActionSession({ roles: ['CREATOR'] });
const PROFILE_PATH = '/[locale]/creator/profile';
const ACCOUNTS_PATH = '/[locale]/creator/accounts';

function accountsUrl(locale: string, outcome: ConnectionOutcome): string {
  if (outcome.kind === 'choose-account') {
    return `/${locale}/creator/accounts/choose?pending=${encodeURIComponent(outcome.pendingId)}`;
  }
  return `/${locale}/creator/accounts?result=${outcome.kind}`;
}

/** FR-2.1 / UC-C1. */
export async function saveProfileDetailsAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const input = parseForm(profileDetailsSchema, formData);
    await updateProfileDetails(getContainer(), session.user.id, input);
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** UC-C6. */
export async function setAvailabilityAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const { isOpen } = parseForm(availabilitySchema, formData);
    await setAvailability(getContainer(), session.user.id, isOpen);
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** UC-C6. */
export async function saveRateCardAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const prices = parseForm(rateCardSchema, formData);
    await updateRateCard(
      getContainer(),
      session.user.id,
      Object.entries(prices)
        .filter((entry): entry is [keyof typeof prices, number] => entry[1] !== null)
        .map(([deliverable, rupees]) => ({ deliverable, rupees })),
    );
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** FR-2.2. */
export async function addPortfolioItemAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const item = parseForm(portfolioItemSchema, formData);
    await addPortfolioItem(getContainer(), session.user.id, item);
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** FR-2.2. */
export async function removePortfolioItemAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const { id } = parseForm(targetIdSchema, formData);
    await removePortfolioItem(getContainer(), session.user.id, id);
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** FR-2.1 / SR-9: the file's bytes are checked and scanned by the service. */
export async function uploadPhotoAction(_: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      throw validationFailed({ photo: 'validation.required' });
    }
    await uploadProfilePhoto(
      getContainer(),
      session.user.id,
      Buffer.from(await file.arrayBuffer()),
    );
    revalidatePath(PROFILE_PATH, 'page');
  });
}

/** FR-3.1: links a YouTube channel by URL without proving ownership (unverified). */
export async function linkChannelAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await creatorOnly();
    const { channelUrlOrId } = parseForm(channelLinkSchema, formData);
    const outcome = await connectPublicChannel(getContainer(), {
      userId: session.user.id,
      channelUrlOrId,
    });
    redirect(accountsUrl(locale, outcome));
  });
}

/** UC-C2: connect the chosen channel from a multi-channel login. */
export async function chooseAccountAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = await getLocale();
  return runAction(async () => {
    const session = await creatorOnly();
    const input = parseForm(chooseAccountSchema, formData);
    const outcome = await choosePendingAccount(getContainer(), {
      userId: session.user.id,
      ...input,
    });
    redirect(accountsUrl(locale, outcome));
  });
}

/** UC-C5 / PRV-7. */
export async function disconnectAccountAction(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const session = await creatorOnly();
    const { id } = parseForm(targetIdSchema, formData);
    await disconnectAccount(getContainer(), { userId: session.user.id, accountId: id });
    revalidatePath(ACCOUNTS_PATH, 'page');
  });
}
