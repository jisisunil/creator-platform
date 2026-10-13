import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Main landmark with a page heading; `narrow` suits single forms. */
export function PageShell({
  title,
  intro,
  narrow = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main id="main" className={cn('mx-auto px-4 py-10', narrow ? 'max-w-md' : 'max-w-3xl')}>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {intro ? <div className="text-muted-foreground mt-2">{intro}</div> : null}
      <div className="mt-6 grid gap-6">{children}</div>
    </main>
  );
}
