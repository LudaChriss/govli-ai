/**
 * Utility functions
 */

import { type ClassValue, clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

/**
 * Merge class names
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format date
 */
export function formatDate(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'MMM d, yyyy');
  } catch {
    return 'Invalid date';
  }
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'MMM d, yyyy h:mm a');
  } catch {
    return 'Invalid date';
  }
}

/**
 * Get status display
 */
export function getStatusDisplay(status: string): {
  label: string;
  color: string;
} {
  const statusMap: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'Pending Review', color: 'bg-gray-500' },
    ACKNOWLEDGED: { label: 'Acknowledged', color: 'bg-blue-500' },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-teal-500' },
    FULFILLED: { label: 'Fulfilled', color: 'bg-green-500' },
    DENIED: { label: 'Denied', color: 'bg-red-500' },
    APPEALED: { label: 'Appealed', color: 'bg-gold-500' },
    CLOSED: { label: 'Closed', color: 'bg-gray-700' },
  };
  
  return statusMap[status] || { label: status, color: 'bg-gray-500' };
}

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (US format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-\(\)\+]{10,}$/;
  return phoneRegex.test(phone);
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
