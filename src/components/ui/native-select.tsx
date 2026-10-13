import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A styled native <select>: accessible and light on low-end phones (NFR-5, NFR-6). */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'border-input flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
