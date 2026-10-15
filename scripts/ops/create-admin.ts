/**
 * Creates an operator's admin account (SR-4). Run on the server (docs/runbooks/deploy.md):
 *   docker compose run --rm web node_modules/.bin/tsx scripts/ops/create-admin.ts \
 *     ops@example.in "Ops Name"
 * The account has no password: set one with "Forgot password", then enrol two-factor sign-in.
 */
import { z } from 'zod';
import { getContainer } from '@/adapters/container';
import { createAdminAccount } from '@/services/admin';

const argumentsSchema = z.tuple([z.email(), z.string().trim().min(2).max(80)]);

async function main(): Promise<void> {
  const parsed = argumentsSchema.safeParse(process.argv.slice(2));
  if (!parsed.success) throw new Error('Usage: create-admin.ts <email> "<full name>"');
  const [email, name] = parsed.data;
  const container = getContainer();
  try {
    const { userId } = await createAdminAccount(container, { email, name });
    console.log(`Admin ${userId} created. Next: "Forgot password" on the sign-in page.`);
  } finally {
    await container.db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
