import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getContainer } from '@/adapters/container';
import { isValidStorageKey } from '@/adapters/storage/file-storage';
import { getServerEnv } from '@/config/env';
import { handleRoute } from '@/lib/route';
import { isValidFileSignature } from '@/lib/signed-file-url';

const querySchema = z.object({
  key: z.string().refine(isValidStorageKey),
  expires: z.string().regex(/^\d+$/),
  signature: z.string().min(10).max(100),
});

/**
 * SR-9: serves a private file only with a valid, unexpired signature. Responses are
 * sandboxed and never sniffed, so an uploaded file can't run as a page (SEC-8). Production
 * serves files from object storage on a separate domain (phase i).
 */
export function GET(request: Request): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    const container = getContainer();
    if (
      !parsed.success ||
      !isValidFileSignature(parsed.data, getServerEnv().AUTH_SECRET, container.clock.now())
    ) {
      return new NextResponse(null, { status: 403 });
    }
    const file = await container.fileStorage.get(parsed.data.key);
    if (!file) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=3600',
      },
    });
  });
}
