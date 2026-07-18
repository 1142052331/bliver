import { forwardRef } from 'react';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      loading = false,
      className,
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref,
  ) {
    const classes = ['bliver-icon-button', className]
      .filter(Boolean)
      .join(' ');
    const ariaBusy = loading ? true : props['aria-busy'];

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        aria-busy={ariaBusy}
        aria-label={label}
        title={label}
        className={classes}
        disabled={disabled || loading}
      >
        {children}
      </button>
    );
  },
);
