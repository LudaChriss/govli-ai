import React from 'react';

export interface SLAIndicatorProps {
  children: React.ReactNode;
  variant?: string;
}

export function SLAIndicator({ children, variant = 'primary' }: SLAIndicatorProps) {
  return <div className={variant}>{children}</div>;
}
