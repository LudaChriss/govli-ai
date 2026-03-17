import React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: string;
  size?: string;
}

export function Badge({ children, variant = 'primary', size }: BadgeProps) {
  return <span className={`${variant} ${size || ''}`.trim()}>{children}</span>;
}
