/**
 * LocalStorage utilities for draft auto-save
 */

const DRAFT_KEY_PREFIX = 'foia_draft_';

/**
 * Save draft to localStorage
 */
export function saveDraft<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  
  try {
    const fullKey = `${DRAFT_KEY_PREFIX}${key}`;
    localStorage.setItem(fullKey, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save draft:', error);
  }
}

/**
 * Load draft from localStorage
 */
export function loadDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const fullKey = `${DRAFT_KEY_PREFIX}${key}`;
    const data = localStorage.getItem(fullKey);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

/**
 * Clear draft from localStorage
 */
export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const fullKey = `${DRAFT_KEY_PREFIX}${key}`;
    localStorage.removeItem(fullKey);
  } catch (error) {
    console.error('Failed to clear draft:', error);
  }
}

/**
 * Set auth token
 */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('foia_auth_token', token);
}

/**
 * Get auth token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('foia_auth_token');
}

/**
 * Clear auth token
 */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('foia_auth_token');
}
