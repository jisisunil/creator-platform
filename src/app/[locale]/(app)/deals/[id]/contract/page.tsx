import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { AcceptContractForm, PrintButton } from '@/components/deals/DealForms';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { DEAL_LIMITS } from '@/config/collaboration';
import { splitPayment } from '@/domain/deals';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { fileUrlFor } from '@/lib/file-url';
import { formatMoney } from '@/lib/format';
import { type ContractView, getDealContract } from '@/services/deals';

/** The standard clauses, in order (text in i18n `deals.contract.clauses`, ADR-012). */
const CLAUSES = [
  'scope',
  'review',
  'changes',
  'payment',
  'usage',
  'disclosure',
  'cancellation',
  'disputes',
  'platform',
] as const;

/**
 * ADR-012: the current contract version as both sides accepted it: the key terms fixed at
 * issue, the standard clauses (or the brand's own PDF), extra terms, who accepted and when,
 * and the fingerprint. Printable; "Print" can save it as a PDF. No contact details (SR-12).
 */
export default async function DealContractPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('deals.contract');
  const tTerms = await getTranslations('requests.terms');
  const tDeliverables = await getTranslations('deliverables');
  const tRights = await getTranslations('requests.usageRights');
  const format = await getFormatter();
  const container = getContainer();

  let view: ContractView;
  try {
    view = await getDealContract(container, { userId: session.user.id, dealId: id });
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const { contract, deal } = view;
  if (!contract) notFound();
  const { terms } = contract;
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, terms.currencyCode, locale, session.user.countryCode);
  const isoDate = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  const split = splitPayment(terms.amountMinor, terms.advancePercent);
  const profileUrl = new URL(`/c/${deal.creatorSlug}`, container.appUrl).toString();
  const acceptedBy = (side: 'BRAND' | 'CREATOR') =>
    contract.acceptances.find((acceptance) => acceptance.side === side);
  const fileUrl = fileUrlFor(contract.fileStorageKey);

  const rows: readonly [string, string][] = [
    [t('brand'), terms.brandName],
    [t('creator'), `${terms.creatorName} (${profileUrl})`],
    [t('campaign'), terms.campaignName],
    [
      t('deliverables'),
      terms.deliverables
        .map((line) =>
          tTerms('deliverableLine', {
            quantity: line.quantity,
            deliverable: tDeliverables(line.deliverable),
          }),
        )
        .join(', '),
    ],
    [t('deadline'), isoDate(terms.deadline)],
    [t('usageRights'), tRights(terms.usageRights)],
    [t('amount'), money(terms.amountMinor)],
    [
      t('paymentTerms'),
      terms.paymentMethod === 'ESCROW'
        ? t('heldInEscrow')
        : terms.advancePercent
          ? t('split', {
              percent: terms.advancePercent,
              advance: money(split.advanceMinor),
              balance: money(split.balanceMinor),
            })
          : t('fullOnApproval'),
    ],
    [
      t('paymentDue'),
      terms.paymentDueOn
        ? isoDate(terms.paymentDueOn)
        : t('dueDays', { days: DEAL_LIMITS.paymentGraceDays }),
    ],
    [t('reviewPeriod'), t('reviewDays', { days: terms.reviewDays })],
    [t('changeRounds'), t('rounds', { count: terms.maxChangeRequests })],
  ];

  return (
    <PageShell
      title={t('documentTitle')}
      intro={t('documentIntro', {
        version: contract.version,
        date: format.dateTime(contract.createdAt, { dateStyle: 'long' }),
      })}
    >
      <div className="flex flex-wrap gap-3 print:hidden">
        <PrintButton />
        <Button asChild variant="ghost">
          <Link href={`/deals/${deal.id}`}>{t('backToDeal')}</Link>
        </Button>
      </div>

      <section aria-labelledby="key-terms" className="grid gap-3">
        <h2 id="key-terms" className="font-serif text-2xl">
          {t('keyTerms')}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-medium">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1 text-sm">
          <p className="font-medium">{t('brief')}</p>
          <p className="whitespace-pre-line">{terms.brief}</p>
        </div>
      </section>

      {contract.source === 'UPLOADED' ? (
        <section aria-labelledby="own-contract" className="grid gap-2">
          <h2 id="own-contract" className="font-serif text-2xl">
            {t('ownContract')}
          </h2>
          <p className="text-sm">{t('ownContractText')}</p>
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm underline print:hidden"
            >
              {t('openPdf', { name: contract.fileName ?? 'contract.pdf' })}
            </a>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="clauses" className="grid gap-2">
          <h2 id="clauses" className="font-serif text-2xl">
            {t('clausesTitle')}
          </h2>
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            {CLAUSES.map((clause) => (
              <li key={clause}>
                {/* ADR-013: escrow deals have their own payment clause. */}
                {t(
                  `clauses.${clause === 'payment' && terms.paymentMethod === 'ESCROW' ? 'paymentEscrow' : clause}`,
                  {
                    reviewDays: terms.reviewDays,
                    rounds: terms.maxChangeRequests,
                  },
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {contract.additionalTerms ? (
        <section aria-labelledby="additional" className="grid gap-2">
          <h2 id="additional" className="font-serif text-2xl">
            {t('additionalTitle')}
          </h2>
          <p className="text-sm whitespace-pre-line">{contract.additionalTerms}</p>
        </section>
      ) : null}

      <section aria-labelledby="acceptance" className="grid gap-2">
        <h2 id="acceptance" className="font-serif text-2xl">
          {t('acceptanceTitle')}
        </h2>
        <ul className="grid gap-1 text-sm">
          {(['BRAND', 'CREATOR'] as const).map((side) => {
            const acceptance = acceptedBy(side);
            return (
              <li key={side}>
                {acceptance
                  ? t('acceptedOn', {
                      side,
                      date: format.dateTime(acceptance.acceptedAt, {
                        dateStyle: 'long',
                        timeStyle: 'short',
                      }),
                    })
                  : t('notAccepted', { side })}
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs break-all">
          {t('fingerprint', { fingerprint: contract.fingerprint })}
        </p>
        <p className="text-muted-foreground text-xs">{t('legalNote')}</p>
      </section>

      {view.canAccept ? (
        <div className="print:hidden">
          <AcceptContractForm dealId={deal.id} fingerprint={contract.fingerprint} />
        </div>
      ) : null}
    </PageShell>
  );
}
