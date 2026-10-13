import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground',
      success: 'border-green-700/30 bg-green-50 text-green-900',
      destructive: 'border-destructive/40 bg-red-50 text-red-900',
    },
  },
  defaultVariants: { variant: 'default' },
});

/** A message box. Errors and successes are announced to screen readers. */
function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  const role = variant === 'destructive' ? 'alert' : 'status';
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert };
