import React from 'react';

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: string;
  size?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Button({
  children,
  variant = 'primary',
  size,
  onClick,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${variant} ${size || ''} ${className || ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
