import sharp from 'sharp';
import { PROFILE_PHOTO } from '@/config/creators';

/**
 * NFR-6: shrinks a profile photo to a small square WebP. Re-encoding also drops
 * all metadata, so a phone photo's GPS location never reaches brands. Returns null when
 * the bytes are not an image sharp can decode.
 */
export async function compressProfilePhoto(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes, { limitInputPixels: PROFILE_PHOTO.maxInputPixels })
      .rotate() // apply the EXIF orientation before the metadata is dropped
      .resize(PROFILE_PHOTO.outputSizePx, PROFILE_PHOTO.outputSizePx, { fit: 'cover' })
      .webp({ quality: PROFILE_PHOTO.outputQuality })
      .toBuffer();
  } catch (error: unknown) {
    // Corrupt files and pixel bombs land here; the caller rejects the upload.
    if (error instanceof Error) return null;
    throw error;
  }
}
