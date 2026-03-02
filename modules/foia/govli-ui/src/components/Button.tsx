import React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: string;
}

export function Button({ children, variant = 'primary' }: ButtonProps) {
  return <button className={variant}>{children}</button>;
}
