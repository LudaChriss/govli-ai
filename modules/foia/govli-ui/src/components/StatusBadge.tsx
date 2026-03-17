import React from 'react';

export interface StatusBadgeProps {
  status?: any;
  children?: React.ReactNode;
  variant?: string;
}

export function StatusBadge({ status, children, variant = 'primary' }: StatusBadgeProps) {
  return <span className={variant}>{status || children}</span>;
}
