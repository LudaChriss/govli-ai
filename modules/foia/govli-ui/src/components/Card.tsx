import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  variant?: string;
}

export function Card({ children, variant = 'primary' }: CardProps) {
  return <div className={variant}>{children}</div>;
}
