import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Links that switch an admin queue between statuses (open, resolved, ...). */
export function StatusTabs<Status extends string>({
  statuses,
  current,
  basePath,
  labelFor,
}: {
  statuses: readonly Status[];
  current: Status;
  basePath: string;
  labelFor: (status: Status) => string;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {statuses.map((status) => (
        <Link
          key={status}
          href={`${basePath}?status=${status}`}
          aria-current={status === current ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1',
            status === current ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          {labelFor(status)}
        </Link>
      ))}
    </div>
  );
}

/** The status from the query string, or the first one when missing or unknown. */
export function statusFrom<Status extends string>(
  statuses: readonly [Status, ...Status[]],
  value: string | string[] | undefined,
): Status {
  return statuses.find((status) => status === value) ?? statuses[0];
}
