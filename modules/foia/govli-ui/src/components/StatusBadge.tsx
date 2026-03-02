import React from 'react';

export interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: string;
}

export function StatusBadge({ children, variant = 'primary' }: StatusBadgeProps) {
  return <span className={variant}>{children}</span>;
}
