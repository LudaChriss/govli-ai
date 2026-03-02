import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
}

export function Badge({ children, variant = 'primary' }: BadgeProps) {
  return <span className={variant}>{children}</span>;
}
