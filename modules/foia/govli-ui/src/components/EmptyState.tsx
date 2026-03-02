import React from 'react';

export interface EmptyStateProps {
  children: React.ReactNode;
  variant?: string;
}

export function EmptyState({ children, variant = 'primary' }: EmptyStateProps) {
  return <div className={variant}>{children}</div>;
}
