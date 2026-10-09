import { NextResponse } from 'next/server';
import { mapErrorToResponse } from './http-errors';
import { resolveRequestId, runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Wraps a route handler: assigns a request id for log correlation and turns any thrown
 * error into a safe response via the single error mapper.
 */
export async function handleRoute(
  request: Request,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const response = await runWithRequestContext({ requestId }, async () => {
    try {
      return await handler();
    } catch (error) {
      const mapped = mapErrorToResponse(error);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
