/**
 * FOIA Processing - Document Service
 * Handles document uploads, text extraction, and responsiveness review
 */

import { Pool } from 'pg';
import { Document, DocumentUploadResult, SearchRecordsRequest, SearchRecordsResult, PackageRequest, PackageResult } from '../types';
import { emit } from '@govli/foia-shared';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import pdf from 'pdf-parse';
// @ts-ignore
import mammoth from 'mammoth';
import xlsx from 'xlsx';

/**
 * Document Processing Service
 */
export class DocumentService {
  private db: Pool;
  private uploadDir: string;

  constructor(db: Pool, uploadDir: string = '/tmp/foia-uploads') {
    this.db = db;
    this.uploadDir = uploadDir;

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Upload and process document
   */
  async uploadDocument(
    tenant_id: string,
    foia_request_id: string,
    // @ts-ignore
    file: Express.Multer.File,
    uploaded_by: string
  ): Promise<DocumentUploadResult> {
    // Generate unique storage path
    const fileExtension = path.extname(file.originalname);
    const storageFilename = `${crypto.randomUUID()}${fileExtension}`;
    const storagePath = path.join(this.uploadDir, tenant_id, foia_request_id, storageFilename);

    // Ensure directory exists
    const storageDir = path.dirname(storagePath);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Move file to storage
    fs.writeFileSync(storagePath, file.buffer);

    // Extract text and metadata
    let extracted_text: string | null = null;
    let page_count = 1;
    const extraction_errors: string[] = [];
    let extraction_status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';

    try {
      const result = await this.extractTextFromFile(storagePath, file.mimetype);
      extracted_text = result.text;
      page_count = result.page_count;
    } catch (error) {
      console.error('[DocumentService] Text extraction failed:', error);
      extraction_errors.push(error instanceof Error ? error.message : 'Unknown extraction error');
      extraction_status = 'FAILED';
    }

    // Insert document record
    const documentId = crypto.randomUUID();
    await this.db.query(
      `INSERT INTO foia_documents (
        id, tenant_id, foia_request_id, filename, file_size, mime_type,
        storage_path, page_count, extracted_text, is_responsive,
        redaction_status, uploaded_by, uploaded_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())`,
      [
        documentId,
        tenant_id,
        foia_request_id,
        file.originalname,
        file.size,
        file.mimetype,
        storagePath,
        page_count,
        extracted_text,
        null, // is_responsive not yet determined
        'NOT_STARTED',
        uploaded_by
      ]
    );

    // Emit upload event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.document.uploaded',
      entity_id: documentId,
      entity_type: 'document',
      user_id: uploaded_by,
      metadata: {
        foia_request_id,
        filename: file.originalname,
        file_size: file.size,
        extraction_status
      },
      timestamp: new Date()
    });

    return {
      document_id: documentId,
      filename: file.originalname,
      file_size: file.size,
      page_count,
      extraction_status,
      extraction_errors: extraction_errors.length > 0 ? extraction_errors : undefined
    };
  }

  /**
   * Extract text from various file formats
   */
  private async extractTextFromFile(
    filePath: string,
    mimeType: string
  ): Promise<{ text: string; page_count: number }> {
    const fileBuffer = fs.readFileSync(filePath);

    // PDF
    if (mimeType === 'application/pdf') {
      const data = await pdf(fileBuffer);
      return {
        text: data.text,
        page_count: data.numpages
      };
    }

    // Word documents
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value,
        page_count: Math.ceil(result.value.length / 3000) // Rough estimate
      };
    }

    // Excel/CSV
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'text/csv') {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const texts: string[] = [];

      workbook.SheetNames.forEach((sheetName: string) => {
        const worksheet = workbook.Sheets[sheetName];
        const csvData = xlsx.utils.sheet_to_csv(worksheet);
        texts.push(csvData);
      });

      return {
        text: texts.join('\n\n'),
        page_count: workbook.SheetNames.length
      };
    }

    // Plain text
    if (mimeType === 'text/plain') {
      return {
        text: fileBuffer.toString('utf-8'),
        page_count: 1
      };
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  /**
   * Update document responsiveness determination
   */
  async updateResponsiveness(
    tenant_id: string,
    document_id: string,
    is_responsive: boolean,
    confidence: number,
    reason: string,
    user_id: string
  ): Promise<Document> {
    const result = await this.db.query(
      `UPDATE foia_documents
       SET is_responsive = $1,
           responsiveness_confidence = $2,
           responsiveness_reason = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [is_responsive, confidence, reason, document_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Document not found or access denied');
    }

    const document = result.rows[0] as Document;

    // Emit responsiveness update event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.document.responsiveness.updated',
      entity_id: document_id,
      entity_type: 'document',
      user_id,
      metadata: {
        is_responsive,
        confidence,
        reason
      },
      timestamp: new Date()
    });

    return document;
  }

  /**
   * Search for records in the document repository
   */
  async searchRecords(
    tenant_id: string,
    foia_request_id: string,
    search: SearchRecordsRequest
  ): Promise<SearchRecordsResult> {
    // Build search query
    let query = `
      SELECT
        id,
        filename as title,
        uploaded_at as date,
        uploaded_by as custodian,
        mime_type as record_type,
        ts_rank(
          to_tsvector('english', COALESCE(extracted_text, '')),
          plainto_tsquery('english', $1)
        ) as relevance_score,
        substring(extracted_text, 1, 200) as snippet
      FROM foia_documents
      WHERE tenant_id = $2 AND foia_request_id = $3
        AND to_tsvector('english', COALESCE(extracted_text, '')) @@ plainto_tsquery('english', $1)
    `;

    const params: any[] = [search.query, tenant_id, foia_request_id];
    let paramIndex = 4;

    // Add date range filter
    if (search.date_range_start) {
      query += ` AND uploaded_at >= $${paramIndex}`;
      params.push(search.date_range_start);
      paramIndex++;
    }

    if (search.date_range_end) {
      query += ` AND uploaded_at <= $${paramIndex}`;
      params.push(search.date_range_end);
      paramIndex++;
    }

    // Add record type filter
    if (search.record_types && search.record_types.length > 0) {
      query += ` AND mime_type = ANY($${paramIndex})`;
      params.push(search.record_types);
      paramIndex++;
    }

    query += ` ORDER BY relevance_score DESC LIMIT $${paramIndex}`;
    params.push(search.limit || 50);

    const result = await this.db.query(query, params);

    return {
      records: result.rows,
      total_found: result.rows.length
    };
  }

  /**
   * Package responsive documents for release
   */
  async packageDocuments(
    tenant_id: string,
    foia_request_id: string,
    options: PackageRequest,
    user_id: string
  ): Promise<PackageResult> {
    // Get documents to package
    let query = `
      SELECT d.*, COUNT(rp.id) as redaction_count
      FROM foia_documents d
      LEFT JOIN foia_redaction_proposals rp ON rp.document_id = d.id AND rp.status = 'APPROVED'
      WHERE d.tenant_id = $1 AND d.foia_request_id = $2
    `;

    if (options.include_responsive_only) {
      query += ` AND d.is_responsive = true`;
    }

    query += ` GROUP BY d.id ORDER BY d.uploaded_at ASC`;

    const result = await this.db.query(query, [tenant_id, foia_request_id]);
    const documents = result.rows;

    if (documents.length === 0) {
      throw new Error('No documents available for packaging');
    }

    // Generate package ID
    const package_id = crypto.randomUUID();
    const packageDir = path.join(this.uploadDir, tenant_id, 'packages', package_id);
    fs.mkdirSync(packageDir, { recursive: true });

    // TODO: Implement actual PDF generation with redactions applied
    // For now, just create a placeholder
    const packagePath = path.join(packageDir, `package_${package_id}.${options.format.toLowerCase()}`);
    fs.writeFileSync(packagePath, `Package for FOIA Request: ${foia_request_id}\nDocuments: ${documents.length}`);

    const stats = fs.statSync(packagePath);

    // Create package record
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7); // 7 day expiration

    await this.db.query(
      `INSERT INTO foia_packages (
        id, tenant_id, foia_request_id, file_path, file_size,
        format, created_by, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
      [package_id, tenant_id, foia_request_id, packagePath, stats.size, options.format, user_id, expires_at]
    );

    // Emit package created event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.package.created',
      entity_id: package_id,
      entity_type: 'package',
      user_id,
      metadata: {
        foia_request_id,
        document_count: documents.length,
        format: options.format
      },
      timestamp: new Date()
    });

    return {
      package_id,
      download_url: `/api/v1/foia/processing/packages/${package_id}/download`,
      file_size: stats.size,
      created_at: new Date(),
      expires_at
    };
  }

  /**
   * Get document by ID
   */
  async getDocument(tenant_id: string, document_id: string): Promise<Document> {
    const result = await this.db.query(
      `SELECT * FROM foia_documents WHERE id = $1 AND tenant_id = $2`,
      [document_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Document not found or access denied');
    }

    return result.rows[0] as Document;
  }

  /**
   * Get all documents for a FOIA request
   */
  async getDocumentsByRequest(tenant_id: string, foia_request_id: string): Promise<Document[]> {
    const result = await this.db.query(
      `SELECT * FROM foia_documents
       WHERE tenant_id = $1 AND foia_request_id = $2
       ORDER BY uploaded_at DESC`,
      [tenant_id, foia_request_id]
    );

    return result.rows as Document[];
  }
}
