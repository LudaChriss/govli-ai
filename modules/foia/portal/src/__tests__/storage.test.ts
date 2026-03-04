import {
  saveDraft,
  loadDraft,
  clearDraft,
} from '@/lib/storage';

describe('Storage Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load draft', () => {
    const data = { name: 'Test', email: 'test@example.com' };
    
    saveDraft('test_form', data);
    const loaded = loadDraft<typeof data>('test_form');
    
    expect(loaded).toEqual(data);
  });

  it('should return null for non-existent draft', () => {
    const loaded = loadDraft('non_existent');
    expect(loaded).toBeNull();
  });

  it('should clear draft', () => {
    saveDraft('test_form', { data: 'test' });
    clearDraft('test_form');
    
    const loaded = loadDraft('test_form');
    expect(loaded).toBeNull();
  });
});
