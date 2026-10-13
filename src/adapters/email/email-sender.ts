import nodemailer from 'nodemailer';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Delivers one email. Throws on failure so the caller can retry. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

const SMTP_TIMEOUT_MS = 10_000;

/** SMTP delivery: Mailpit in development, the provider's SMTP endpoint in production. */
export function createSmtpEmailSender(smtpUrl: string, from: string): EmailSender {
  const url = new URL(smtpUrl);
  const transport = nodemailer.createTransport({
    host: url.hostname,
    port: Number(url.port) || undefined,
    secure: url.protocol === 'smtps:',
    auth: url.username
      ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
      : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    // Message content is built by us; never let it pull files or URLs from the server.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}
