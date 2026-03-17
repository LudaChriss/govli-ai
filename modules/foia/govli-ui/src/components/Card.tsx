import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export function Card({ children, variant = 'primary', className }: CardProps) {
  return <div className={`${variant} ${className || ''}`.trim()}>{children}</div>;
}
