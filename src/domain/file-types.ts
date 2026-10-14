export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * The image type from the file's first bytes (SR-9). The browser-supplied type is never
 * trusted: a script renamed to .jpg has the wrong signature and is rejected.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const startsWith = (signature: readonly number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
