import type { DomainErrorCode } from '@/domain/errors';

/** Every error code a client can receive: domain codes plus the generic INTERNAL. */
export type ErrorCode = DomainErrorCode | 'INTERNAL';
