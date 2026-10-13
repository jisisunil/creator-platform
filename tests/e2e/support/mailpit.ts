import { expect } from '@playwright/test';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSearchResult {
  messages: { ID: string; Subject: string }[];
}

/**
 * Waits for the newest email to `toAddress` whose subject matches, then returns the first
 * link in it that contains `pathFragment`. Emails are sent by the worker, so this polls.
 */
export async function linkFromEmail(
  toAddress: string,
  subject: RegExp,
  pathFragment: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${toAddress}"`);
        const search = (await (
          await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)
        ).json()) as MailpitSearchResult;
        const message = search.messages.find((candidate) => subject.test(candidate.Subject));
        if (!message) return undefined;
        const full = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)
        ).json()) as {
          Text: string;
        };
        link = full.Text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(pathFragment));
        return link;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBeDefined();
  if (!link) throw new Error(`No link containing ${pathFragment} for ${toAddress}`);
  return link;
}
