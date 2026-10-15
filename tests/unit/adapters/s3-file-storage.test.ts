import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { createS3FileStorage, type S3Sender } from '@/adapters/storage/s3-file-storage';

const BUCKET = 'creator-platform-test-files';
const KEY = 'photos/abcdefghijklmnopqrstuvwx';

/** An in-memory bucket that answers the three commands the adapter sends. */
function fakeBucket(): S3Sender & {
  readonly objects: Map<string, { body: Uint8Array; type?: string }>;
} {
  const objects = new Map<string, { body: Uint8Array; type?: string }>();
  return {
    objects,
    async send(command) {
      expect(command.input.Bucket).toBe(BUCKET);
      const key = command.input.Key ?? '';
      if (command instanceof PutObjectCommand) {
        objects.set(key, {
          body: command.input.Body as Uint8Array,
          type: command.input.ContentType,
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(key);
        if (!object) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
        return {
          Body: { transformToByteArray: async () => object.body },
          ContentType: object.type,
        };
      }
      if (command instanceof DeleteObjectCommand) objects.delete(key);
      return {};
    },
  };
}

describe('S3 file storage (SR-9)', () => {
  it('stores, reads back and deletes a file with its content type', async () => {
    const bucket = fakeBucket();
    const storage = createS3FileStorage(bucket, BUCKET);

    await storage.put(KEY, { bytes: Buffer.from('photo'), contentType: 'image/webp' });
    const stored = await storage.get(KEY);
    await storage.delete(KEY);

    expect(stored).toEqual({ bytes: Buffer.from('photo'), contentType: 'image/webp' });
    expect(bucket.objects.size).toBe(0);
  });

  it('returns null for a missing file', async () => {
    await expect(createS3FileStorage(fakeBucket(), BUCKET).get(KEY)).resolves.toBeNull();
  });

  it('refuses keys that could reach other objects', async () => {
    const storage = createS3FileStorage(fakeBucket(), BUCKET);

    await expect(storage.get('../other/key')).rejects.toThrow(/Invalid storage key/);
    await expect(
      storage.put('photos/../../secret-file-name-here', {
        bytes: Buffer.from('x'),
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(/Invalid storage key/);
  });

  it('passes other S3 errors on so the caller can retry or fail', async () => {
    const failing: S3Sender = {
      send: async () => {
        throw Object.assign(new Error('slow down'), { name: 'SlowDown' });
      },
    };

    await expect(createS3FileStorage(failing, BUCKET).get(KEY)).rejects.toThrow('slow down');
  });
});
