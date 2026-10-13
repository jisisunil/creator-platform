'use client';

import Script from 'next/script';

/**
 * Cloudflare Turnstile CAPTCHA (SR-3, SR-11). Renders nothing when no site key is set
 * (development). The widget adds a hidden `captchaToken` field to the form.
 */
export function Turnstile({ siteKey, nonce }: { siteKey?: string; nonce?: string }) {
  if (!siteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        nonce={nonce}
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-response-field-name="captchaToken"
      />
    </>
  );
}
