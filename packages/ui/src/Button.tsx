import { forwardRef } from 'react';

import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly loading?: boolean;
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'publish';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    disabled,
    loading = false,
    style,
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref,
) {
  const classes = ['bliver-button', `bliver-button--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  const ariaBusy = loading ? true : props['aria-busy'];

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-busy={ariaBusy}
      className={classes}
      disabled={disabled || loading}
      style={{ ...style, minHeight: '44px' }}
    />
  );
});
