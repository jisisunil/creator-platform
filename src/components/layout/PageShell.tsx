import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Main landmark with a page heading; `narrow` suits single forms, `wide` sidebars and tables. */
export function PageShell({
  title,
  intro,
  narrow = false,
  wide = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  narrow?: boolean;
  /** For layouts with a sidebar or wide tables (search, compare). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      id="main"
      className={cn('mx-auto px-4 py-10', narrow ? 'max-w-md' : wide ? 'max-w-6xl' : 'max-w-3xl')}
    >
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {intro ? <div className="text-muted-foreground mt-2">{intro}</div> : null}
      <div className="mt-6 grid gap-6">{children}</div>
    </main>
  );
}
