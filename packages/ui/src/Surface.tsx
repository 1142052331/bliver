import { forwardRef } from 'react';

import type { HTMLAttributes } from 'react';

export type SurfaceProps = HTMLAttributes<HTMLElement>;

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  { className, ...props },
  ref,
) {
  const classes = ['bliver-surface', className].filter(Boolean).join(' ');

  return <section {...props} ref={ref} className={classes} />;
});
