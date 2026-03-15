/**
 * GovQA Compatibility - Field Mapper Tests
 */

import {
  govqaToGovli,
  govliToGovqa,
  govliDocumentToGovqa,
  govliTimelineToGovqaMessage,
  parseGovqaFilters,
  GovQACase,
  GovliRequest
} from '../src/services/fieldMapper';

describe('Field Mapper', () => {
  describe('govqaToGovli', () => {
    it('should convert GovQA case to Govli request', () => {
      const govqaCase: GovQACase = {
        case_number: 'GQ-2026-001',
        subject: 'Police budget records',
        department_code: 'PD',
        requester_name: 'John Doe',
        requester_email: 'john@example.com',
        requester_phone: '555-0123',
        status_code: 'NEW',
        assigned_to: 'officer-123',
        created_date: '2026-03-01T10:00:00Z',
        due_date: '2026-03-21T10:00:00Z'
      };

      const govliRequest = govqaToGovli(govqaCase);

      expect(govliRequest.legacy_id).toBe('GQ-2026-001');
      expect(govliRequest.migration_source).toBe('govqa');
      expect(govliRequest.description).toContain('Police budget records');
      expect(govliRequest.agencies_requested).toEqual(['PD']);
      expect(govliRequest.requester.name).toBe('John Doe');
      expect(govliRequest.requester.email).toBe('john@example.com');
      expect(govliRequest.requester.phone).toBe('555-0123');
      expect(govliRequest.foia_status).toBe('SUBMITTED');
      expect(govliRequest.assigned_officer_id).toBe('officer-123');
      expect(govliRequest.submitted_at).toBe('2026-03-01T10:00:00Z');
      expect(govliRequest.statutory_deadline).toBe('2026-03-21T10:00:00Z');
    });

    it('should map GovQA status codes correctly', () => {
      expect(govqaToGovli({ ...baseCase, status_code: 'NEW' }).foia_status).toBe('SUBMITTED');
      expect(govqaToGovli({ ...baseCase, status_code: 'IN_PROGRESS' }).foia_status).toBe('IN_PROGRESS');
      expect(govqaToGovli({ ...baseCase, status_code: 'CLOSED' }).foia_status).toBe('DELIVERED');
      expect(govqaToGovli({ ...baseCase, status_code: 'DENIED' }).foia_status).toBe('CLOSED');
    });
  });

  describe('govliToGovqa', () => {
    it('should convert Govli request to GovQA case', () => {
      const govliRequest: GovliRequest = {
        id: 'req-123',
        legacy_id: 'GQ-2026-001',
        migration_source: 'govqa',
        description: 'Police budget records\n\nDetailed description here',
        agencies_requested: ['PD'],
        requester: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-0123'
        },
        foia_status: 'SUBMITTED',
        assigned_officer_id: 'officer-123',
        submitted_at: '2026-03-01T10:00:00Z',
        statutory_deadline: '2026-03-21T10:00:00Z'
      };

      const govqaCase = govliToGovqa(govliRequest);

      expect(govqaCase.case_number).toBe('GQ-2026-001');
      expect(govqaCase.subject).toBe('Police budget records');
      expect(govqaCase.description).toBe('Detailed description here');
      expect(govqaCase.department_code).toBe('PD');
      expect(govqaCase.requester_name).toBe('John Doe');
      expect(govqaCase.requester_email).toBe('john@example.com');
      expect(govqaCase.requester_phone).toBe('555-0123');
      expect(govqaCase.status_code).toBe('NEW');
      expect(govqaCase.assigned_to).toBe('officer-123');
    });

    it('should truncate long subjects to 200 characters', () => {
      const longDescription = 'A'.repeat(250);
      const govliRequest: GovliRequest = {
        description: longDescription,
        requester: { name: 'Test', email: 'test@example.com' },
        foia_status: 'SUBMITTED',
        submitted_at: '2026-03-01T10:00:00Z'
      };

      const govqaCase = govliToGovqa(govliRequest);

      expect(govqaCase.subject.length).toBe(200);
    });
  });

  describe('govliDocumentToGovqa', () => {
    it('should convert Govli document to GovQA format', () => {
      const govliDoc = {
        id: 'doc-123',
        file_name: 'report.pdf',
        file_size: 1024000,
        uploaded_at: '2026-03-15T14:30:00Z',
        uploaded_by: 'officer-456',
        document_type: 'RESPONSE'
      };

      const govqaDoc = govliDocumentToGovqa(govliDoc, 'GQ-2026-001');

      expect(govqaDoc.document_id).toBe('doc-123');
      expect(govqaDoc.case_number).toBe('GQ-2026-001');
      expect(govqaDoc.file_name).toBe('report.pdf');
      expect(govqaDoc.file_size).toBe(1024000);
      expect(govqaDoc.uploaded_by).toBe('officer-456');
      expect(govqaDoc.document_type).toBe('RESPONSE');
    });
  });

  describe('govliTimelineToGovqaMessage', () => {
    it('should convert timeline event to GovQA message', () => {
      const timelineEvent = {
        id: 'event-123',
        event_type: 'STATUS_CHANGE',
        description: 'Request moved to in progress',
        actor_name: 'Jane Officer',
        created_at: '2026-03-15T10:00:00Z',
        visibility: 'PUBLIC'
      };

      const govqaMessage = govliTimelineToGovqaMessage(timelineEvent, 'GQ-2026-001');

      expect(govqaMessage.message_id).toBe('event-123');
      expect(govqaMessage.case_number).toBe('GQ-2026-001');
      expect(govqaMessage.sender).toBe('Jane Officer');
      expect(govqaMessage.message_text).toBe('Request moved to in progress');
      expect(govqaMessage.is_internal).toBe(false);
    });

    it('should mark internal messages correctly', () => {
      const internalEvent = {
        id: 'event-456',
        description: 'Internal note',
        created_at: '2026-03-15T10:00:00Z',
        visibility: 'INTERNAL'
      };

      const govqaMessage = govliTimelineToGovqaMessage(internalEvent, 'GQ-2026-001');

      expect(govqaMessage.is_internal).toBe(true);
    });
  });

  describe('parseGovqaFilters', () => {
    it('should parse GovQA query parameters to Govli format', () => {
      const govqaQuery = {
        status: 'IN_PROGRESS',
        department: 'PD',
        assigned_to: 'officer-123',
        from_date: '2026-01-01',
        to_date: '2026-03-31',
        page: '2',
        limit: '25'
      };

      const govliQuery = parseGovqaFilters(govqaQuery);

      expect(govliQuery.status).toBe('IN_PROGRESS');
      expect(govliQuery.agency).toBe('PD');
      expect(govliQuery.assigned_to).toBe('officer-123');
      expect(govliQuery.date_from).toBe('2026-01-01');
      expect(govliQuery.date_to).toBe('2026-03-31');
      expect(govliQuery.page).toBe('2');
      expect(govliQuery.limit).toBe('25');
    });
  });
});

const baseCase: GovQACase = {
  case_number: 'GQ-001',
  subject: 'Test',
  requester_name: 'Test User',
  requester_email: 'test@example.com',
  status_code: 'NEW',
  created_date: '2026-03-01T10:00:00Z'
};
