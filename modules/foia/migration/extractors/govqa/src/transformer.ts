/**
 * GovQA Data Transformer
 * Transforms GovQA data to Govli format
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  MigrationConfig,
  GovQAContact,
  GovQACase,
  GovQADocument,
  GovQACommunication,
  GovQAFee,
  GovliMigrationContact,
  GovliMigrationRequest,
  GovliMigrationDocument,
  GovliMigrationCommunication,
  GovliMigrationFee,
  TransformationResult
} from './types';

export class GovQATransformer {
  private config: MigrationConfig;
  private contactMap: Map<string | number, GovQAContact> = new Map();

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  /**
   * Load contacts into memory for requester lookups
   */
  async loadContacts(): Promise<void> {
    const contactsFile = path.join(this.config.output_dir, 'govqa_contacts.jsonl');

    if (!fs.existsSync(contactsFile)) {
      console.warn('Contacts file not found, skipping contact loading');
      return;
    }

    const fileStream = fs.createReadStream(contactsFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        const contact: GovQAContact = JSON.parse(line);
        this.contactMap.set(contact.id, contact);
      }
    }

    console.log(`✅ Loaded ${this.contactMap.size} contacts into memory`);
  }

  /**
   * Normalize date from GovQA to ISO 8601
   */
  private normalizeDate(dateValue: any): string {
    if (!dateValue) {
      return new Date().toISOString();
    }

    try {
      // Try parsing as ISO 8601
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }

      // Try parsing MM/DD/YYYY
      const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const match = dateValue.match(mmddyyyy);
      if (match) {
        const [, month, day, year] = match;
        return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
      }

      // Fallback to current date
      return new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Map GovQA status to Govli status
   */
  private mapStatus(govqaStatus: string): string {
    const normalized = govqaStatus?.toLowerCase().trim();

    // Use config mapping first
    if (this.config.status_mapping[normalized]) {
      return this.config.status_mapping[normalized];
    }

    // Fallback keyword matching
    const statusKeywords: Record<string, string> = {
      'open': 'SUBMITTED',
      'new': 'SUBMITTED',
      'submitted': 'SUBMITTED',
      'received': 'SUBMITTED',
      'pending': 'IN_PROGRESS',
      'in progress': 'IN_PROGRESS',
      'processing': 'IN_PROGRESS',
      'assigned': 'IN_PROGRESS',
      'under review': 'IN_PROGRESS',
      'closed': 'CLOSED',
      'completed': 'CLOSED',
      'fulfilled': 'CLOSED',
      'denied': 'DENIED',
      'rejected': 'DENIED',
      'withdrawn': 'WITHDRAWN',
      'cancelled': 'WITHDRAWN'
    };

    for (const [keyword, status] of Object.entries(statusKeywords)) {
      if (normalized.includes(keyword)) {
        return status;
      }
    }

    // Default to SUBMITTED
    return 'SUBMITTED';
  }

  /**
   * Clean GovQA filename (remove prefixes)
   */
  private cleanFilename(filename: string): string {
    // Remove common GovQA prefixes like "GOVQA_12345_filename.pdf"
    return filename.replace(/^GOVQA_\d+_/, '').replace(/^GQ_\d+_/, '');
  }

  /**
   * Deduplicate requester by email
   */
  private deduplicateRequester(email: string): GovQAContact | null {
    for (const contact of this.contactMap.values()) {
      if (contact.email?.toLowerCase() === email?.toLowerCase()) {
        return contact;
      }
    }
    return null;
  }

  /**
   * Transform Contact
   */
  transformContact(contact: GovQAContact): TransformationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!contact.email) {
      warnings.push('Contact has no email address');
    }

    const transformed: GovliMigrationContact = {
      legacy_id: String(contact.id),
      first_name: contact.first_name || 'Unknown',
      last_name: contact.last_name || 'Unknown',
      email: contact.email || `no-email-${contact.id}@example.com`,
      phone: contact.phone,
      organization: contact.organization,
      address: contact.address ? `${contact.address}, ${contact.city || ''}, ${contact.state || ''} ${contact.zip || ''}`.trim() : undefined
    };

    return {
      source_type: 'GovQAContact',
      source_id: contact.id,
      target_type: 'GovliMigrationContact',
      target_data: transformed,
      warnings,
      errors
    };
  }

  /**
   * Transform Case (Request)
   */
  transformCase(govqaCase: GovQACase): TransformationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!govqaCase.description) {
      errors.push('Case has no description');
    }

    // Deduplicate requester by email
    let requester: any = {
      name: govqaCase.requester_name || 'Unknown Requester',
      email: govqaCase.requester_email || `no-email-${govqaCase.id}@example.com`,
      phone: govqaCase.requester_phone,
      organization: govqaCase.requester_organization,
      address: govqaCase.requester_address
    };

    if (govqaCase.requester_email) {
      const existingContact = this.deduplicateRequester(govqaCase.requester_email);
      if (existingContact) {
        warnings.push(`Deduplicated requester to existing contact: ${existingContact.id}`);
        requester = {
          name: `${existingContact.first_name} ${existingContact.last_name}`,
          email: existingContact.email,
          phone: existingContact.phone || govqaCase.requester_phone,
          organization: existingContact.organization || govqaCase.requester_organization
        };
      }
    }

    const transformed: GovliMigrationRequest = {
      legacy_id: String(govqaCase.id),
      migration_source: 'govqa',
      tracking_number: govqaCase.case_number,
      description: govqaCase.description,
      requester,
      foia_status: this.mapStatus(govqaCase.status),
      submitted_at: this.normalizeDate(govqaCase.date_received || govqaCase.date_submitted),
      due_date: govqaCase.date_due ? this.normalizeDate(govqaCase.date_due) : undefined,
      closed_at: govqaCase.date_closed ? this.normalizeDate(govqaCase.date_closed) : undefined,
      assigned_department: govqaCase.assigned_department,
      fee_amount: govqaCase.fee_amount,
      fee_waived: govqaCase.fee_waived,
      internal_notes: govqaCase.notes,
      custom_metadata: govqaCase.custom_fields
    };

    return {
      source_type: 'GovQACase',
      source_id: govqaCase.id,
      target_type: 'GovliMigrationRequest',
      target_data: transformed,
      warnings,
      errors
    };
  }

  /**
   * Transform Document
   */
  transformDocument(document: GovQADocument): TransformationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!document.case_id) {
      errors.push('Document has no case_id (orphaned document)');
    }

    const transformed: GovliMigrationDocument = {
      legacy_id: String(document.id),
      request_legacy_id: String(document.case_id),
      filename: this.cleanFilename(document.filename),
      file_size: document.file_size,
      mime_type: document.mime_type || 'application/octet-stream',
      file_url: document.download_url,
      uploaded_at: this.normalizeDate(document.upload_date),
      uploaded_by: document.uploaded_by,
      document_type: document.document_type,
      is_public: document.is_public
    };

    return {
      source_type: 'GovQADocument',
      source_id: document.id,
      target_type: 'GovliMigrationDocument',
      target_data: transformed,
      warnings,
      errors
    };
  }

  /**
   * Transform Communication
   */
  transformCommunication(comm: GovQACommunication): TransformationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!comm.case_id) {
      errors.push('Communication has no case_id');
    }

    const transformed: GovliMigrationCommunication = {
      legacy_id: String(comm.id),
      request_legacy_id: String(comm.case_id),
      message_type: comm.message_type,
      subject: comm.subject,
      body: comm.body,
      from_user: comm.from_user,
      to_user: comm.to_user,
      is_internal: comm.is_internal,
      sent_at: this.normalizeDate(comm.created_at)
    };

    return {
      source_type: 'GovQACommunication',
      source_id: comm.id,
      target_type: 'GovliMigrationCommunication',
      target_data: transformed,
      warnings,
      errors
    };
  }

  /**
   * Transform Fee
   */
  transformFee(fee: GovQAFee): TransformationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!fee.case_id) {
      errors.push('Fee has no case_id');
    }

    const transformed: GovliMigrationFee = {
      legacy_id: String(fee.id),
      request_legacy_id: String(fee.case_id),
      amount: fee.amount,
      description: fee.description,
      payment_status: fee.payment_status,
      payment_date: fee.payment_date ? this.normalizeDate(fee.payment_date) : undefined,
      payment_method: fee.payment_method
    };

    return {
      source_type: 'GovQAFee',
      source_id: fee.id,
      target_type: 'GovliMigrationFee',
      target_data: transformed,
      warnings,
      errors
    };
  }

  /**
   * Transform JSONL file
   */
  async transformFile<TSource, TTarget>(
    sourceFile: string,
    targetFile: string,
    transformFn: (item: TSource) => TransformationResult
  ): Promise<{ total: number; successful: number; failed: number }> {
    const sourcePath = path.join(this.config.output_dir, sourceFile);
    const targetPath = path.join(this.config.output_dir, targetFile);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`Source file not found: ${sourceFile}`);
      return { total: 0, successful: 0, failed: 0 };
    }

    const fileStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(targetPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let total = 0;
    let successful = 0;
    let failed = 0;

    for await (const line of rl) {
      if (line.trim()) {
        total++;
        try {
          const sourceItem: TSource = JSON.parse(line);
          const result = transformFn(sourceItem);

          if (result.errors.length > 0) {
            failed++;
            console.error(`Transformation errors for ${result.source_id}:`, result.errors);
          } else {
            successful++;
            writeStream.write(JSON.stringify(result.target_data) + '\n');
          }

          if (result.warnings.length > 0) {
            console.warn(`Transformation warnings for ${result.source_id}:`, result.warnings);
          }
        } catch (error) {
          failed++;
          console.error(`Failed to transform line:`, error);
        }
      }
    }

    writeStream.end();

    return { total, successful, failed };
  }

  /**
   * Transform all extracted data
   */
  async transformAll(): Promise<void> {
    console.log('\n🔄 Transforming GovQA data to Govli format...\n');

    // Load contacts first for deduplication
    await this.loadContacts();

    // Transform each entity type
    const contactsResult = await this.transformFile<GovQAContact, GovliMigrationContact>(
      'govqa_contacts.jsonl',
      'govli_contacts.jsonl',
      this.transformContact.bind(this)
    );
    console.log(`✅ Contacts: ${contactsResult.successful}/${contactsResult.total} transformed`);

    const casesResult = await this.transformFile<GovQACase, GovliMigrationRequest>(
      'govqa_cases.jsonl',
      'govli_requests.jsonl',
      this.transformCase.bind(this)
    );
    console.log(`✅ Cases: ${casesResult.successful}/${casesResult.total} transformed`);

    const documentsResult = await this.transformFile<GovQADocument, GovliMigrationDocument>(
      'govqa_documents.jsonl',
      'govli_documents.jsonl',
      this.transformDocument.bind(this)
    );
    console.log(`✅ Documents: ${documentsResult.successful}/${documentsResult.total} transformed`);

    const communicationsResult = await this.transformFile<GovQACommunication, GovliMigrationCommunication>(
      'govqa_communications.jsonl',
      'govli_communications.jsonl',
      this.transformCommunication.bind(this)
    );
    console.log(`✅ Communications: ${communicationsResult.successful}/${communicationsResult.total} transformed`);

    const feesResult = await this.transformFile<GovQAFee, GovliMigrationFee>(
      'govqa_fees.jsonl',
      'govli_fees.jsonl',
      this.transformFee.bind(this)
    );
    console.log(`✅ Fees: ${feesResult.successful}/${feesResult.total} transformed`);

    console.log('\n✅ Transformation complete!');
  }
}