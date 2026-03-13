/**
 * AI-5: Vaughn Index Generator - Test Suite
 */

import { Pool } from 'pg';
import { VaughnService } from '../src/services/vaughnService';
import { VaughnDocumentGenerator } from '../src/services/documentGenerator';
import {
  GenerateVaughnIndexInput,
  EditVaughnEntryInput,
  VaughnIndex,
  VaughnEntry
} from '../src/types';

// Mock the shared AI client
jest.mock('@govli/foia-shared', () => ({
  getSharedAIClient: jest.fn(),
  emit: jest.fn().mockResolvedValue(undefined)
}));

import { getSharedAIClient } from '@govli/foia-shared';

describe('AI-5: Vaughn Index Generator', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAIClient: any;
  let vaughnService: VaughnService;
  let documentGenerator: VaughnDocumentGenerator;

  const TENANT_ID = 'test-tenant-123';
  const USER_ID = 'user-456';
  const REQUEST_ID = 'request-789';
  const INDEX_ID = 'index-001';
  const ENTRY_ID = 'entry-001';

  beforeEach(() => {
    // Mock database pool
    mockDb = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as any;

    // Mock AI client
    mockAIClient = {
      callWithAudit: jest.fn()
    };
    (getSharedAIClient as jest.Mock).mockReturnValue(mockAIClient);

    vaughnService = new VaughnService(mockDb);
    documentGenerator = new VaughnDocumentGenerator('/tmp/test-vaughn');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // VaughnService.generateVaughnIndex() Tests
  // ==========================================================================

  describe('generateVaughnIndex', () => {
    const baseInput: GenerateVaughnIndexInput = {
      foia_request_id: REQUEST_ID
    };

    it('should generate Vaughn Index with multiple entries', async () => {
      // Mock fetch FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: REQUEST_ID,
            request_number: 'FOIA-2024-001',
            requester_name: 'John Doe',
            tenant_id: TENANT_ID
          }
        ]
      });

      // Mock fetch withheld documents
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            document_id: 'doc-1',
            document_type: 'email',
            document_date: new Date('2024-01-15'),
            document_metadata: { subject: 'Budget Discussion' },
            exemption_code: 'b5',
            withheld_in_full: true,
            ai_reasoning: 'Contains deliberative process material',
            redaction_notes: 'Pre-decisional memo'
          },
          {
            document_id: 'doc-2',
            document_type: 'memo',
            document_date: new Date('2024-02-10'),
            document_metadata: { subject: 'Personnel Matter' },
            exemption_code: 'b6',
            withheld_in_full: true,
            ai_reasoning: 'Contains personal privacy information',
            redaction_notes: 'Protected privacy data'
          }
        ]
      });

      // Mock insert Vaughn Index
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: INDEX_ID,
            tenant_id: TENANT_ID,
            foia_request_id: REQUEST_ID,
            request_number: 'FOIA-2024-001',
            requester_name: 'John Doe',
            entry_count: 2,
            total_documents_withheld: 2,
            generated_by: USER_ID,
            generated_at: new Date(),
            status: 'DRAFT',
            model_used: 'claude-3-5-sonnet-20241022',
            generation_time_ms: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      // Mock AI responses for entries
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          document_description: 'Email dated January 15, 2024 regarding budget deliberations',
          statutory_citation: '5 U.S.C. § 552(b)(5)',
          exemption_explanation: 'This email contains pre-decisional deliberative process material protected by the deliberative process privilege.',
          segregability_explanation: 'The entire document consists of protected deliberative material with no segregable portions.'
        })
      });

      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          document_description: 'Memo dated February 10, 2024 concerning personnel matters',
          statutory_citation: '5 U.S.C. § 552(b)(6)',
          exemption_explanation: 'This memo contains personal privacy information about agency employees.',
          segregability_explanation: 'No segregable portions exist as the entire document pertains to protected personnel information.'
        })
      });

      // Mock insert entries
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'entry-1',
            vaughn_index_id: INDEX_ID,
            entry_number: 1,
            document_description: 'Email dated January 15, 2024',
            document_type: 'email',
            exemption_code: 'b5',
            statutory_citation: '5 U.S.C. § 552(b)(5)',
            exemption_explanation: 'Protected deliberative material',
            withheld_in_full: true,
            original_entry: 'AI generated entry',
            version_history: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      // Mock update generation time
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await vaughnService.generateVaughnIndex(
        TENANT_ID,
        USER_ID,
        baseInput
      );

      expect(result.index).toBeDefined();
      expect(result.index.entry_count).toBe(2);
      expect(result.entries).toHaveLength(2);
      expect(mockAIClient.callWithAudit).toHaveBeenCalledTimes(2);
      expect(mockAIClient.callWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          feature: 'ai-5-vaughn-entry'
        })
      );
    });

    it('should throw error if no withheld documents found', async () => {
      // Mock fetch FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, request_number: 'FOIA-2024-001', requester_name: 'John Doe' }]
      });

      // Mock no withheld documents
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await expect(
        vaughnService.generateVaughnIndex(TENANT_ID, USER_ID, baseInput)
      ).rejects.toThrow('No withheld documents found');
    });

    it('should create placeholder entries when AI generation fails', async () => {
      // Mock fetch request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, request_number: 'FOIA-2024-001', requester_name: 'John Doe' }]
      });

      // Mock withheld doc
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            document_id: 'doc-1',
            document_type: 'email',
            document_date: new Date('2024-01-15'),
            document_metadata: {},
            exemption_code: 'b5',
            withheld_in_full: true,
            ai_reasoning: null,
            redaction_notes: null
          }
        ]
      });

      // Mock insert index
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: INDEX_ID,
            entry_count: 1,
            total_documents_withheld: 1,
            generated_by: USER_ID,
            status: 'DRAFT'
          }
        ]
      });

      // Mock AI failure
      mockAIClient.callWithAudit.mockRejectedValueOnce(new Error('AI service unavailable'));

      // Mock insert placeholder entry
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: ENTRY_ID,
            entry_number: 1,
            exemption_explanation: '[ERROR: AI generation failed]',
            original_entry: '[ERROR]'
          }
        ]
      });

      // Mock update
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await vaughnService.generateVaughnIndex(TENANT_ID, USER_ID, baseInput);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].exemption_explanation).toContain('ERROR');
    });
  });

  // ==========================================================================
  // VaughnService.getVaughnIndex() Tests
  // ==========================================================================

  describe('getVaughnIndex', () => {
    it('should retrieve Vaughn Index with entries', async () => {
      // Mock fetch index
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: INDEX_ID,
            tenant_id: TENANT_ID,
            foia_request_id: REQUEST_ID,
            request_number: 'FOIA-2024-001',
            entry_count: 2,
            status: 'DRAFT'
          }
        ]
      });

      // Mock fetch entries
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-1',
            vaughn_index_id: INDEX_ID,
            entry_number: 1,
            document_description: 'Email',
            document_type: 'email',
            exemption_code: 'b5',
            withheld_in_full: true,
            version_history: []
          },
          {
            id: 'entry-2',
            vaughn_index_id: INDEX_ID,
            entry_number: 2,
            document_description: 'Memo',
            document_type: 'memo',
            exemption_code: 'b6',
            withheld_in_full: true,
            version_history: []
          }
        ]
      });

      const result = await vaughnService.getVaughnIndex(TENANT_ID, INDEX_ID);

      expect(result).toBeDefined();
      expect(result?.index.id).toBe(INDEX_ID);
      expect(result?.entries).toHaveLength(2);
    });

    it('should return null if index not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await vaughnService.getVaughnIndex(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // VaughnService.editEntry() Tests
  // ==========================================================================

  describe('editEntry', () => {
    it('should edit entry and track version history', async () => {
      const editInput: EditVaughnEntryInput = {
        entry_text: 'Updated Vaughn entry with more specific legal reasoning',
        edit_notes: 'Added case law citation'
      };

      // Mock fetch current entry
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: ENTRY_ID,
            original_entry: 'Original AI-generated entry',
            edited_entry: null,
            version_history: [],
            tenant_id: TENANT_ID
          }
        ]
      });

      // Mock update entry
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: ENTRY_ID,
            edited_entry: editInput.entry_text,
            edited_by: USER_ID,
            edited_at: new Date(),
            edit_notes: editInput.edit_notes,
            version_history: [
              {
                version: 1,
                entry_text: editInput.entry_text,
                edited_by: USER_ID,
                edited_at: new Date(),
                edit_notes: editInput.edit_notes
              }
            ],
            original_entry: 'Original',
            version_history_length: 1
          }
        ]
      });

      const result = await vaughnService.editEntry(
        TENANT_ID,
        ENTRY_ID,
        USER_ID,
        editInput
      );

      expect(result.edited_entry).toBe(editInput.entry_text);
      expect(result.edited_by).toBe(USER_ID);
      expect(result.version_history).toHaveLength(1);
    });
  });

  // ==========================================================================
  // VaughnDocumentGenerator Tests
  // ==========================================================================

  describe('VaughnDocumentGenerator', () => {
    const mockIndex: VaughnIndex = {
      id: INDEX_ID,
      tenant_id: TENANT_ID,
      foia_request_id: REQUEST_ID,
      request_number: 'FOIA-2024-001',
      requester_name: 'John Doe',
      litigation_hold_id: null,
      entry_count: 2,
      total_documents_withheld: 2,
      generated_by: USER_ID,
      generated_at: new Date(),
      pdf_path: null,
      docx_path: null,
      status: 'DRAFT',
      finalized_at: null,
      finalized_by: null,
      model_used: 'claude-3-5-sonnet-20241022',
      generation_time_ms: 5000,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockEntries: VaughnEntry[] = [
      {
        id: 'entry-1',
        vaughn_index_id: INDEX_ID,
        entry_number: 1,
        document_description: 'Email dated January 15, 2024',
        document_date: new Date('2024-01-15'),
        document_type: 'email',
        exemption_code: 'b5',
        statutory_citation: '5 U.S.C. § 552(b)(5)',
        exemption_explanation: 'Contains deliberative process material',
        withheld_in_full: true,
        segregability_explanation: 'Entire document protected',
        source_document_id: 'doc-1',
        source_redaction_id: null,
        ai_reasoning: 'AI determined deliberative content',
        original_entry: 'Original entry',
        edited_entry: null,
        edited_by: null,
        edited_at: null,
        edit_notes: null,
        version_history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    it('should generate PDF with all required sections', async () => {
      const options = {
        include_cover_page: true,
        include_table_of_contents: true,
        include_declaration_page: true,
        agency_name: 'Test Agency',
        agency_address: '123 Main St'
      };

      const pdfPath = await documentGenerator.generatePDF(mockIndex, mockEntries, options);

      expect(pdfPath).toContain('vaughn-index');
      expect(pdfPath).toContain('.pdf');
    });

    it('should generate DOCX backup', async () => {
      const options = {
        include_cover_page: true,
        include_table_of_contents: true,
        include_declaration_page: true,
        agency_name: 'Test Agency',
        agency_address: '123 Main St'
      };

      const docxPath = await documentGenerator.generateDOCX(mockIndex, mockEntries, options);

      expect(docxPath).toContain('vaughn-index');
      expect(docxPath).toContain('.docx');
    });
  });
});
