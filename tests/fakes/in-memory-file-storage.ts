import type { FileStorage, StoredFile } from '@/adapters/storage/file-storage';

/** File storage kept in memory, for tests. */
export function createInMemoryFileStorage(): FileStorage & {
  readonly files: Map<string, StoredFile>;
} {
  const files = new Map<string, StoredFile>();
  return {
    files,
    put: async (key, file) => {
      files.set(key, file);
    },
    get: async (key) => files.get(key) ?? null,
    delete: async (key) => {
      files.delete(key);
    },
  };
}
