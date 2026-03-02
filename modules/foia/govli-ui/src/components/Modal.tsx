import React from 'react';

export interface ModalProps {
  children: React.ReactNode;
  variant?: string;
}

export function Modal({ children, variant = 'primary' }: ModalProps) {
  return <dialog className={variant}>{children}</dialog>;
}
