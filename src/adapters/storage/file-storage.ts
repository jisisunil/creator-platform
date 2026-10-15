import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredFile {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/**
 * Private file storage (SR-9): files live outside the web root under random keys and are
 * only served through signed, expiring URLs. Local disk in development; an S3 bucket in
 * Mumbai for staging and production (`s3-file-storage.ts`).
 */
export interface FileStorage {
  put(key: string, file: StoredFile): Promise<void>;
  /** Null when the key doesn't exist. */
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z]+\/[A-Za-z0-9_-]{20,64}$/;

/** Keys look like "photos/<random>"; anything else is refused, so paths can't escape. */
export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** Stores each file as <key> plus <key>.type holding its content type. */
export function createLocalFileStorage(baseDirectory: string): FileStorage {
  const pathFor = (key: string): string => {
    if (!isValidStorageKey(key)) throw new Error('Invalid storage key');
    return path.join(baseDirectory, key);
  };
  return {
    async put(key, file) {
      const filePath = pathFor(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.bytes);
      await writeFile(`${filePath}.type`, file.contentType);
    },
    async get(key) {
      const filePath = pathFor(key);
      try {
        const [bytes, contentType] = await Promise.all([
          readFile(filePath),
          readFile(`${filePath}.type`, 'utf8'),
        ]);
        return { bytes, contentType };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async delete(key) {
      const filePath = pathFor(key);
      await rm(filePath, { force: true });
      await rm(`${filePath}.type`, { force: true });
    },
  };
}
