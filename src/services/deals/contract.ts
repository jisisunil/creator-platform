/** Deals module: the contract both sides accept before work starts (ADR-012). */
import { createHash, randomBytes } from 'node:crypto';
import type { DealRecord } from '@/adapters/db/deal-repository';
import type { ContractRecord, ContractSource } from '@/adapters/db/deal-work-repository';
import { DEAL_CONTRACT, WORK_REVIEW } from '@/config/collaboration';
import { safeFileName } from '@/domain/chat';
import {
  canonicalContractContent,
  type ContractState,
  contractStateOf,
  type ContractTerms,
  toIsoDate,
} from '@/domain/contracts';
import { allowedDealActions } from '@/domain/deals';
import { invalidState, validationFailed } from '@/domain/errors';
import { detectAttachmentType } from '@/domain/file-types';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import {
  loadDealFacts,
  notifyOtherSide,
  performAction,
  requireDealParticipant,
} from './deal-actions';

const PAISE_PER_RUPEE = 100;
const DAY_MS = 86_400_000;
const logger = getLogger('deals');

export type { ContractRecord } from '@/adapters/db/deal-work-repository';

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** The terms a new contract version fixes, from the deal as it is now. */
function contractTermsFor(deal: DealRecord): ContractTerms {
  if (deal.agreedAmountMinor === null) throw invalidState();
  return {
    brandName: deal.brandName,
    creatorName: deal.creatorDisplayName,
    campaignName: deal.campaignName,
    brief: deal.brief,
    deliverables: deal.deliverables,
    usageRights: deal.usageRights,
    amountMinor: deal.agreedAmountMinor,
    currencyCode: deal.currencyCode,
    paymentMethod: deal.paymentMethod,
    advancePercent: deal.advancePercent,
    paymentDueOn: deal.paymentDueOn ? toIsoDate(deal.paymentDueOn) : null,
    deadline: toIsoDate(deal.deadline),
    reviewDays: WORK_REVIEW.reviewDays,
    maxChangeRequests: WORK_REVIEW.maxChangeRequests,
  };
}

interface StoredContractFile {
  readonly storageKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

/** Checks and stores the brand's own PDF (SR-9: type from its bytes, malware scan). */
async function storeContractFile(
  ctx: ServiceContext,
  file: { readonly bytes: Buffer; readonly fileName: string },
): Promise<StoredContractFile> {
  if (file.bytes.length === 0 || file.bytes.length > DEAL_CONTRACT.fileMaxBytes) {
    throw validationFailed({ file: 'contract.fileTooLarge' });
  }
  if (detectAttachmentType(file.bytes) !== 'application/pdf') {
    throw validationFailed({ file: 'contract.fileType' });
  }
  if ((await ctx.malwareScanner.scan(file.bytes)) !== 'CLEAN') {
    logger.warn({ action: 'contract.file-rejected' }, 'infected contract file rejected');
    throw validationFailed({ file: 'contract.fileRejected' });
  }
  return copyToNewKey(ctx, file.bytes, safeFileName(file.fileName, DEAL_CONTRACT.fileNameMax));
}

/** Each version keeps its own copy, so a version's file never changes after acceptance. */
async function copyToNewKey(
  ctx: ServiceContext,
  bytes: Buffer,
  fileName: string,
): Promise<StoredContractFile> {
  const storageKey = `contracts/${randomBytes(24).toString('base64url')}`;
  await ctx.fileStorage.put(storageKey, { bytes, contentType: 'application/pdf' });
  return { storageKey, fileName, sizeBytes: bytes.length, sha256: sha256(bytes) };
}

/** The PDF for an uploaded contract: a new upload, or the previous version's file again. */
async function contractFileFor(
  ctx: ServiceContext,
  upload: { readonly bytes: Buffer; readonly fileName: string } | null,
  previous: ContractRecord | null,
): Promise<StoredContractFile> {
  if (upload) return storeContractFile(ctx, upload);
  if (previous?.fileStorageKey && previous.fileName) {
    const stored = await ctx.fileStorage.get(previous.fileStorageKey);
    if (stored) return copyToNewKey(ctx, stored.bytes, previous.fileName);
  }
  throw validationFailed({ file: 'contract.fileRequired' });
}

export interface IssueContractInput {
  readonly userId: string;
  readonly dealId: string;
  readonly amountRupees: number;
  readonly advancePercent: number | null;
  /** "YYYY-MM-DD" or null. */
  readonly paymentDueOn: string | null;
  readonly additionalTerms: string;
  readonly source: ContractSource;
  /** The brand's own PDF; for an uploaded contract without one, the last version's PDF. */
  readonly file: { readonly bytes: Buffer; readonly fileName: string } | null;
}

/**
 * FR-9.2 / ADR-012: the brand sets the amount and payment terms and issues them as a new
 * contract version: the standard contract, or its own PDF with the key terms alongside.
 * Issuing counts as the brand's acceptance; the creator must accept this exact version
 * before submitting work. Only while the work is with the creator.
 */
export async function issueContract(ctx: ServiceContext, input: IssueContractInput): Promise<void> {
  await performAction(ctx, input, 'ISSUE_CONTRACT', async (deal, side, now) => {
    const paymentDueOn = input.paymentDueOn ? new Date(`${input.paymentDueOn}T00:00:00Z`) : null;
    const today = new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
    if (paymentDueOn && (Number.isNaN(paymentDueOn.getTime()) || paymentDueOn < today)) {
      throw validationFailed({ paymentDueOn: 'deal.invalidDueDate' });
    }
    const additionalTerms = input.additionalTerms.trim() || null;
    const file =
      input.source === 'UPLOADED'
        ? await contractFileFor(ctx, input.file, await ctx.repos.dealWork.currentContract(deal.id))
        : null;
    return {
      changes: {
        agreedAmountMinor: input.amountRupees * PAISE_PER_RUPEE,
        // ADR-013: escrow holds the whole amount until approval, so there is no advance.
        advancePercent: deal.paymentMethod === 'ESCROW' ? null : input.advancePercent,
        paymentDueOn,
      },
      event: { kind: 'CONTRACT_ISSUED' },
      alsoDo: async (repos) => {
        // Read again inside the transaction: the terms just saved are what the contract fixes.
        const current = await repos.deals.findById(deal.id);
        if (!current) throw invalidState();
        const terms = contractTermsFor(current);
        const content = {
          templateVersion: DEAL_CONTRACT.templateVersion,
          terms,
          additionalTerms,
          fileSha256: file?.sha256 ?? null,
        };
        await repos.dealWork.issueContract({
          dealId: deal.id,
          source: input.source,
          templateVersion: content.templateVersion,
          terms,
          additionalTerms,
          file,
          fingerprint: sha256(canonicalContractContent(content)),
          issuedByUserId: input.userId,
          issuerSide: side,
          issuedAt: now,
        });
        await notifyOtherSide(ctx, deal, side, (recipient) => ({
          template: 'contractIssued',
          payload: { ...recipient, brandName: deal.brandName, campaignName: deal.campaignName },
        }))(repos);
      },
      cleanUp: file ? () => ctx.fileStorage.delete(file.storageKey) : undefined,
    };
  });
}

/**
 * ADR-012: the creator accepts the contract version they read (its fingerprint). If the
 * brand issued a newer version meanwhile, nothing is accepted and the page shows the new one.
 */
export async function acceptContract(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string; readonly fingerprint: string },
): Promise<void> {
  await performAction(ctx, input, 'ACCEPT_CONTRACT', (deal, side, now) => ({
    event: { kind: 'CONTRACT_ACCEPTED' },
    alsoDo: async (repos) => {
      const contract = await repos.dealWork.currentContract(deal.id);
      if (contract?.fingerprint !== input.fingerprint) throw invalidState();
      const isNew = await repos.dealWork.acceptContract({
        contractId: contract.id,
        side,
        userId: input.userId,
        acceptedAt: now,
      });
      if (!isNew) throw invalidState();
      await notifyOtherSide(ctx, deal, side, (recipient) => ({
        template: 'contractAccepted',
        payload: {
          ...recipient,
          otherPartyName: side === 'BRAND' ? deal.brandName : deal.creatorDisplayName,
          campaignName: deal.campaignName,
        },
      }))(repos);
    },
  }));
}

export interface ContractView {
  readonly contract: ContractRecord | null;
  readonly state: ContractState;
  readonly viewerSide: 'BRAND' | 'CREATOR';
  /** Whether the viewer can accept this version now. */
  readonly canAccept: boolean;
  readonly deal: DealRecord;
}

/** ADR-012: a deal's current contract version, for either side of the deal only (SR-5). */
export async function getDealContract(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly dealId: string },
): Promise<ContractView> {
  const { deal, side } = await requireDealParticipant(ctx.repos, input.userId, input.dealId);
  const facts = await loadDealFacts(ctx.repos, deal);
  return {
    contract: facts.contract,
    state: contractStateOf(facts.hasContract, facts.contractAcceptedBy),
    viewerSide: side,
    canAccept: allowedDealActions(deal.status, side, facts).includes('ACCEPT_CONTRACT'),
    deal,
  };
}
