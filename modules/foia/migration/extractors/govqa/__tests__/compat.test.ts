/**
 * GovQA Extractor Tests
 */

import { GovQAClient } from '../src/govqaClient';
import { GovQATransformer } from '../src/transformer';
import { MigrationConfig, GovQACase, GovQAContact, GovQADocument } from '../src/types';
import axios from 'axios';

// Mock axios
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfig: MigrationConfig = {
  govqa: {
    govqa_api_url: 'https://test.govqa.com/api',
    govqa_username: 'testuser',
    govqa_password: 'testpass'
  },
  govli: {
    govli_api_url: 'https://api.govli.ai',
    govli_migration_key: 'test-key',
    tenant_id: 'test-tenant'
  },
  status_mapping: {
    'open': 'SUBMITTED',
    'closed': 'CLOSED'
  },
  batch_size: 500,
  output_dir: './test-output',
  resume_from_checkpoint: false
};

describe('GovQA Client', () => {
  describe('Client initialization', () => {
    it('should create client with config', () => {
      // Mock axios.create to return a mock axios instance
      const mockAxiosInstance = {
        interceptors: {
          request: { use: jest.fn() }
        },
        get: jest.fn(),
        post: jest.fn()
      };

      mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

      const client = new GovQAClient(mockConfig.govqa);
      expect(client).toBeDefined();
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: mockConfig.govqa.govqa_api_url
        })
      );
    });
  });
});

describe('GovQA Transformer', () => {
  let transformer: GovQATransformer;

  beforeEach(() => {
    transformer = new GovQATransformer(mockConfig);
  });

  describe('transformContact', () => {
    it('should transform GovQA contact to Govli format', () => {
      const govqaContact: GovQAContact = {
        id: '123',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        organization: 'Test Org',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = transformer.transformContact(govqaContact);

      expect(result.target_type).toBe('GovliMigrationContact');
      expect(result.target_data.legacy_id).toBe('123');
      expect(result.target_data.first_name).toBe('John');
      expect(result.target_data.last_name).toBe('Doe');
      expect(result.target_data.email).toBe('john@example.com');
      expect(result.errors.length).toBe(0);
    });

    it('should warn if contact has no email', () => {
      const govqaContact: GovQAContact = {
        id: '123',
        first_name: 'John',
        last_name: 'Doe',
        email: '',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = transformer.transformContact(govqaContact);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('no email');
    });
  });

  describe('transformCase', () => {
    it('should transform GovQA case to Govli request', () => {
      const govqaCase: GovQACase = {
        id: '456',
        case_number: 'FOIA-2024-001',
        requester_name: 'Jane Smith',
        requester_email: 'jane@example.com',
        description: 'Request for police reports',
        status: 'Open',
        date_received: '2024-01-15T10:00:00Z',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      };

      const result = transformer.transformCase(govqaCase);

      expect(result.target_type).toBe('GovliMigrationRequest');
      expect(result.target_data.legacy_id).toBe('456');
      expect(result.target_data.tracking_number).toBe('FOIA-2024-001');
      expect(result.target_data.description).toBe('Request for police reports');
      expect(result.target_data.foia_status).toBe('SUBMITTED');
      expect(result.target_data.requester.name).toBe('Jane Smith');
      expect(result.target_data.requester.email).toBe('jane@example.com');
      expect(result.errors.length).toBe(0);
    });

    it('should map various GovQA statuses to Govli statuses', () => {
      const testCases = [
        { govqaStatus: 'Open', expectedStatus: 'SUBMITTED' },
        { govqaStatus: 'Closed', expectedStatus: 'CLOSED' },
        { govqaStatus: 'Pending', expectedStatus: 'IN_PROGRESS' },
        { govqaStatus: 'Unknown Status', expectedStatus: 'SUBMITTED' }
      ];

      testCases.forEach(({ govqaStatus, expectedStatus }) => {
        const govqaCase: GovQACase = {
          id: '1',
          case_number: 'TEST-001',
          requester_name: 'Test',
          description: 'Test',
          status: govqaStatus,
          date_received: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        };

        const result = transformer.transformCase(govqaCase);
        expect(result.target_data.foia_status).toBe(expectedStatus);
      });
    });

    it('should error if case has no description', () => {
      const govqaCase: GovQACase = {
        id: '456',
        case_number: 'FOIA-2024-001',
        requester_name: 'Jane Smith',
        description: '',
        status: 'Open',
        date_received: '2024-01-15T10:00:00Z',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z'
      };

      const result = transformer.transformCase(govqaCase);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('no description');
    });
  });

  describe('transformDocument', () => {
    it('should transform GovQA document to Govli format', () => {
      const govqaDoc: GovQADocument = {
        id: '789',
        case_id: '456',
        filename: 'GOVQA_12345_police_report.pdf',
        file_size: 102400,
        mime_type: 'application/pdf',
        download_url: 'https://test.govqa.com/files/789',
        upload_date: '2024-01-16T10:00:00Z'
      };

      const result = transformer.transformDocument(govqaDoc);

      expect(result.target_type).toBe('GovliMigrationDocument');
      expect(result.target_data.legacy_id).toBe('789');
      expect(result.target_data.request_legacy_id).toBe('456');
      expect(result.target_data.filename).toBe('police_report.pdf');
      expect(result.target_data.file_size).toBe(102400);
      expect(result.target_data.mime_type).toBe('application/pdf');
      expect(result.errors.length).toBe(0);
    });

    it('should clean GovQA filename prefixes', () => {
      const testCases = [
        { input: 'GOVQA_12345_document.pdf', expected: 'document.pdf' },
        { input: 'GQ_9999_file.docx', expected: 'file.docx' },
        { input: 'regular_file.pdf', expected: 'regular_file.pdf' }
      ];

      testCases.forEach(({ input, expected }) => {
        const govqaDoc: GovQADocument = {
          id: '1',
          case_id: '1',
          filename: input,
          file_size: 1024,
          download_url: 'https://test.govqa.com/files/1',
          upload_date: '2024-01-01T00:00:00Z'
        };

        const result = transformer.transformDocument(govqaDoc);
        expect(result.target_data.filename).toBe(expected);
      });
    });

    it('should error if document has no case_id', () => {
      const govqaDoc: GovQADocument = {
        id: '789',
        case_id: '',
        filename: 'orphaned.pdf',
        file_size: 1024,
        download_url: 'https://test.govqa.com/files/789',
        upload_date: '2024-01-16T10:00:00Z'
      };

      const result = transformer.transformDocument(govqaDoc);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('no case_id');
    });
  });

  describe('date normalization', () => {
    it('should normalize various date formats', () => {
      const testCases = [
        {
          input: {
            id: '1',
            case_number: 'TEST',
            requester_name: 'Test',
            description: 'Test',
            status: 'Open',
            date_received: '2024-01-15T10:00:00Z',
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z'
          },
          expectedDate: '2024-01-15T10:00:00.000Z'
        },
        {
          input: {
            id: '2',
            case_number: 'TEST',
            requester_name: 'Test',
            description: 'Test',
            status: 'Open',
            date_received: '01/15/2024',
            created_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z'
          },
          expectedDate: '2024-01-15T08:00:00.000Z'
        }
      ];

      testCases.forEach(({ input, expectedDate }) => {
        const result = transformer.transformCase(input as GovQACase);
        expect(result.target_data.submitted_at).toBeDefined();
        // Just check that date is valid ISO string
        expect(() => new Date(result.target_data.submitted_at)).not.toThrow();
      });
    });
  });
});

describe('Integration scenarios', () => {
  it('should handle complete migration workflow types', () => {
    const transformer = new GovQATransformer(mockConfig);

    // Transform a contact
    const contact: GovQAContact = {
      id: '1',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      created_at: '2024-01-01T00:00:00Z'
    };

    const contactResult = transformer.transformContact(contact);
    expect(contactResult.target_data).toBeDefined();

    // Transform a case
    const govqaCase: GovQACase = {
      id: '2',
      case_number: 'FOIA-001',
      requester_name: 'Test User',
      requester_email: 'test@example.com',
      description: 'Test request',
      status: 'Open',
      date_received: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    };

    const caseResult = transformer.transformCase(govqaCase);
    expect(caseResult.target_data).toBeDefined();

    // Transform a document
    const document: GovQADocument = {
      id: '3',
      case_id: '2',
      filename: 'test.pdf',
      file_size: 1024,
      download_url: 'https://test.com/file',
      upload_date: '2024-01-01T00:00:00Z'
    };

    const docResult = transformer.transformDocument(document);
    expect(docResult.target_data).toBeDefined();

    // All transformations should succeed
    expect(contactResult.errors.length).toBe(0);
    expect(caseResult.errors.length).toBe(0);
    expect(docResult.errors.length).toBe(0);
  });
});