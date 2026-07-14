import { forwardRef } from 'react';

import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, style, type = 'button', variant = 'primary', ...props },
  ref,
) {
  const classes = ['bliver-button', `bliver-button--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes}
      style={{ ...style, minHeight: '44px' }}
    />
  );
});
