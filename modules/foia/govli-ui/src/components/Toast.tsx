import React from 'react';

export interface ToastProps {
  children: React.ReactNode;
  variant?: string;
}

export function Toast({ children, variant = 'primary' }: ToastProps) {
  return <div className={variant}>{children}</div>;
}
