/**
 * Template Service Tests
 */

import { TemplateService } from '../services/templateService';
import { TemplateData } from '../types';

describe('TemplateService', () => {
  let templateService: TemplateService;

  beforeEach(() => {
    templateService = new TemplateService();
  });

  describe('getAvailableTemplates', () => {
    it('should return all available template types', () => {
      const templates = templateService.getAvailableTemplates();

      expect(templates).toContain('FULL_GRANT');
      expect(templates).toContain('PARTIAL_GRANT');
      expect(templates).toContain('FULL_DENIAL');
      expect(templates).toContain('NO_RESPONSIVE_RECORDS');
      expect(templates).toContain('FEE_WAIVER_DENIAL');
      expect(templates).toContain('ACKNOWLEDGMENT');
    });
  });

  describe('hasTemplate', () => {
    it('should return true for existing templates', () => {
      expect(templateService.hasTemplate('FULL_GRANT')).toBe(true);
      expect(templateService.hasTemplate('PARTIAL_GRANT')).toBe(true);
    });
  });

  describe('renderTemplate', () => {
    it('should render FULL_GRANT template', () => {
      const data: TemplateData = {
        request_id: 'req-123',
        requester_name: 'John Doe',
        requester_email: 'john@example.com',
        request_subject: 'Request for budget documents',
        received_at: new Date('2024-01-15'),
        agency_name: 'Test Agency',
        agency_address: '123 Main St, City, ST 12345',
        foia_officer_name: 'Jane Smith',
        foia_officer_email: 'jane@agency.gov',
        foia_liaison_name: 'Bob Johnson',
        foia_liaison_phone: '555-0100',
        response_type: 'FULL_GRANT',
        granted_documents: [
          { name: 'Budget Report 2024.pdf', description: 'Annual budget report' },
          { name: 'Expense Summary.xlsx' }
        ],
        appeal_deadline_days: 20
      };

      const result = templateService.renderTemplate('FULL_GRANT', data);

      expect(result).toContain('John Doe');
      expect(result).toContain('req-123');
      expect(result).toContain('Budget Report 2024.pdf');
      expect(result).toContain('Test Agency');
      expect(result).toContain('20 days');
    });

    it('should render PARTIAL_GRANT template with exemptions', () => {
      const data: TemplateData = {
        request_id: 'req-456',
        requester_name: 'Jane Smith',
        requester_email: 'jane@example.com',
        request_subject: 'Request for personnel records',
        received_at: new Date('2024-01-20'),
        agency_name: 'Test Agency',
        foia_officer_name: 'John Officer',
        foia_liaison_name: 'Public Liaison',
        foia_liaison_phone: '555-0200',
        response_type: 'PARTIAL_GRANT',
        granted_documents: [
          { name: 'Public Personnel Data.pdf' }
        ],
        denied_documents: [
          {
            name: 'Private Personnel Records.pdf',
            exemptions: ['5 U.S.C. § 552(b)(6)'],
            reason: 'Personal privacy exemption'
          }
        ],
        exemptions_cited: [
          'Exemption 6: Personnel and medical files'
        ],
        appeal_deadline_days: 20
      };

      const result = templateService.renderTemplate('PARTIAL_GRANT', data);

      expect(result).toContain('Jane Smith');
      expect(result).toContain('in part');
      expect(result).toContain('5 U.S.C. § 552(b)(6)');
      expect(result).toContain('Personal privacy exemption');
    });

    it('should render FULL_DENIAL template', () => {
      const data: TemplateData = {
        request_id: 'req-789',
        requester_name: 'Bob Williams',
        requester_email: 'bob@example.com',
        request_subject: 'Request for classified documents',
        received_at: new Date('2024-01-25'),
        agency_name: 'Test Agency',
        foia_officer_name: 'Security Officer',
        foia_liaison_name: 'Public Liaison',
        foia_liaison_phone: '555-0300',
        response_type: 'FULL_DENIAL',
        denied_documents: [
          {
            name: 'Classified Report.pdf',
            exemptions: ['5 U.S.C. § 552(b)(1)'],
            reason: 'National security exemption'
          }
        ],
        exemptions_cited: [
          'Exemption 1: Classified national defense and foreign policy information'
        ],
        appeal_deadline_days: 20
      };

      const result = templateService.renderTemplate('FULL_DENIAL', data);

      expect(result).toContain('Bob Williams');
      expect(result).toContain('exempt from disclosure');
      expect(result).toContain('Exemption 1');
    });

    it('should render NO_RESPONSIVE_RECORDS template', () => {
      const data: TemplateData = {
        request_id: 'req-999',
        requester_name: 'Alice Brown',
        requester_email: 'alice@example.com',
        request_subject: 'Request for non-existent records',
        received_at: new Date('2024-02-01'),
        agency_name: 'Test Agency',
        foia_officer_name: 'Records Officer',
        foia_liaison_name: 'Public Liaison',
        foia_liaison_phone: '555-0400',
        response_type: 'NO_RESPONSIVE_RECORDS',
        appeal_deadline_days: 20
      };

      const result = templateService.renderTemplate('NO_RESPONSIVE_RECORDS', data);

      expect(result).toContain('Alice Brown');
      expect(result).toContain('no records responsive');
      expect(result).toContain('thorough search');
    });

    it('should render ACKNOWLEDGMENT template', () => {
      const data: TemplateData = {
        request_id: 'req-111',
        requester_name: 'Charlie Davis',
        requester_email: 'charlie@example.com',
        request_subject: 'Request for meeting minutes',
        received_at: new Date('2024-02-05'),
        agency_name: 'Test Agency',
        foia_officer_name: 'Processing Officer',
        foia_officer_email: 'processing@agency.gov',
        foia_liaison_name: 'Public Liaison',
        foia_liaison_phone: '555-0500',
        response_type: 'ACKNOWLEDGMENT',
        appeal_deadline_days: 20
      };

      const result = templateService.renderTemplate('ACKNOWLEDGMENT', data);

      expect(result).toContain('Charlie Davis');
      expect(result).toContain('acknowledges receipt');
      expect(result).toContain('req-111');
      expect(result).toContain('20 business days');
    });

    it('should throw error for non-existent template', () => {
      const data: TemplateData = {
        request_id: 'req-1',
        requester_name: 'Test',
        requester_email: 'test@example.com',
        request_subject: 'Test',
        received_at: new Date(),
        agency_name: 'Agency',
        foia_liaison_name: 'Liaison',
        foia_liaison_phone: '555-0000',
        response_type: 'FULL_GRANT',
        appeal_deadline_days: 20
      };

      expect(() => {
        // @ts-ignore - testing invalid type
        templateService.renderTemplate('INVALID_TYPE', data);
      }).toThrow('Template not found');
    });
  });
});
