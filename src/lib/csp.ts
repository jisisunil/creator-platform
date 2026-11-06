const CAPTCHA_ORIGIN = 'https://challenges.cloudflare.com';
/** Razorpay Checkout: its script (loaded by ours), its window and its API (ADR-013). */
const RAZORPAY_FRAME_ORIGINS = ['https://api.razorpay.com', 'https://checkout.razorpay.com'];
const RAZORPAY_CONNECT_ORIGINS = ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'];

export interface CspOptions {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  /** True when the app is served over HTTPS; then browsers upgrade any http:// subresource. */
  readonly isHttps: boolean;
  /** Origin errors are reported to, e.g. "https://o123.ingest.sentry.io". */
  readonly errorReportingOrigin?: string;
  /** True when the CAPTCHA widget is configured; it runs in a Cloudflare iframe. */
  readonly isCaptchaEnabled?: boolean;
  /** True when payments run on Razorpay; its checkout opens in a Razorpay iframe. */
  readonly isRazorpayEnabled?: boolean;
}

/**
 * Content Security Policy (SR-8). Scripts only run with this request's nonce; nothing may
 * frame the app. Dev mode needs eval and websockets for hot reload.
 */
export function buildContentSecurityPolicy(options: CspOptions): string {
  const scriptSources = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    ...(options.isDevelopment ? ["'unsafe-eval'"] : []),
  ];
  const connectSources = [
    "'self'",
    ...(options.errorReportingOrigin ? [options.errorReportingOrigin] : []),
    ...(options.isRazorpayEnabled ? RAZORPAY_CONNECT_ORIGINS : []),
    ...(options.isDevelopment ? ['ws:'] : []),
  ];
  const frameSources = [
    ...(options.isCaptchaEnabled ? [CAPTCHA_ORIGIN] : []),
    ...(options.isRazorpayEnabled ? RAZORPAY_FRAME_ORIGINS : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    // Next.js and Radix set inline style attributes; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The offline service worker (NFR-5); 'strict-dynamic' would otherwise block it.
    "worker-src 'self'",
    `connect-src ${connectSources.join(' ')}`,
    `frame-src ${frameSources.length > 0 ? frameSources.join(' ') : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.isHttps ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}

/** The origin of a Sentry DSN, for the CSP connect-src. */
export function originOfDsn(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  try {
    return new URL(dsn).origin;
  } catch {
    // An invalid DSN is caught by env validation; here we just don't allow it.
    return undefined;
  }
}
