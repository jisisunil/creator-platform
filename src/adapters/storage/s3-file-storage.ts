import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { type FileStorage, isValidStorageKey } from './file-storage';

/** The one S3Client method this adapter uses, so tests can pass a fake. */
export interface S3Sender {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

const S3_CONNECTION_TIMEOUT_MS = 5_000;
const S3_REQUEST_TIMEOUT_MS = 15_000;

/**
 * An S3 client for the given region. Credentials come from the environment (the VM's IAM
 * role in production); the SDK retries transient failures with back-off.
 */
export function createS3Client(region: string): S3Client {
  return new S3Client({
    region,
    requestHandler: {
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      requestTimeout: S3_REQUEST_TIMEOUT_MS,
    },
  });
}

interface ObjectBody {
  transformToByteArray(): Promise<Uint8Array>;
}

function hasBody(output: unknown): output is { Body: ObjectBody; ContentType?: string } {
  if (typeof output !== 'object' || output === null || !('Body' in output)) return false;
  const body: unknown = output.Body;
  return typeof body === 'object' && body !== null && 'transformToByteArray' in body;
}

function isMissingObject(error: unknown): boolean {
  return error instanceof Error && error.name === 'NoSuchKey';
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/**
 * Private file storage in an S3 bucket (SR-9, phase i). The bucket blocks public access and
 * encrypts at rest; files are only served through the app's signed URLs.
 */
export function createS3FileStorage(client: S3Sender, bucket: string): FileStorage {
  const checkedKey = (key: string): string => {
    if (!isValidStorageKey(key)) throw new Error('Invalid storage key');
    return key;
  };
  return {
    async put(key, file) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: checkedKey(key),
          Body: file.bytes,
          ContentType: file.contentType,
        }),
      );
    },
    async get(key) {
      try {
        const output = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: checkedKey(key) }),
        );
        if (!hasBody(output)) return null;
        return {
          bytes: Buffer.from(await output.Body.transformToByteArray()),
          contentType: output.ContentType ?? DEFAULT_CONTENT_TYPE,
        };
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: checkedKey(key) }));
    },
  };
}
