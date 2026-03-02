import React from 'react';

export interface SpinnerProps {
  children: React.ReactNode;
  variant?: string;
}

export function Spinner({ children, variant = 'primary' }: SpinnerProps) {
  return <span className={variant}>{children}</span>;
}
