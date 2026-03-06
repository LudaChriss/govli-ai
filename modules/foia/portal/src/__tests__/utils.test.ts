import {
  formatDate,
  getStatusDisplay,
  isValidEmail,
  isValidPhone,
  formatFileSize,
} from '@/lib/utils';

describe('Utility Functions', () => {
  describe('formatDate', () => {
    it('should format date correctly', () => {
      const result = formatDate('2024-01-15T10:00:00Z');
      expect(result).toContain('Jan');
      expect(result).toContain('2024');
    });
  });

  describe('getStatusDisplay', () => {
    it('should return correct label for status', () => {
      const pending = getStatusDisplay('PENDING');
      expect(pending.label).toBe('Pending Review');
      
      const fulfilled = getStatusDisplay('FULFILLED');
      expect(fulfilled.label).toBe('Fulfilled');
    });
  });

  describe('isValidEmail', () => {
    it('should validate email correctly', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate phone numbers', () => {
      expect(isValidPhone('123-456-7890')).toBe(true);
      expect(isValidPhone('123')).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format file sizes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
    });
  });
});
