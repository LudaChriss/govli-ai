/**
 * AI-5: Vaughn Index Generator - Core Service
 * Generates formal Vaughn Index documents for FOIA litigation
 */

import { Pool } from 'pg';
import { getSharedAIClient, emit } from '@govli/foia-shared';
import {
  VaughnIndex,
  VaughnEntry,
  VaughnEntryInput,
  GenerateVaughnIndexInput,
  EditVaughnEntryInput,
  RegenerateVaughnIndexInput,
  VaughnEntryVersion
} from '../types';

interface WithheldDocument {
  document_id: string;
  document_type: string;
  document_date: Date | null;
  document_metadata: any;
  exemption_code: string;
  withheld_in_full: boolean;
  ai_reasoning: string | null;
  redaction_notes: string | null;
  approved_by: string | null;
  approved_at: Date | null;
}

export class VaughnService {
  private db: Pool;
  private aiClient: any;

  constructor(db: Pool) {
    this.db = db;
    this.aiClient = getSharedAIClient();
  }

  /**
   * Generate a complete Vaughn Index for a FOIA request
   */
  async generateVaughnIndex(
    tenant_id: string,
    user_id: string,
    input: GenerateVaughnIndexInput
  ): Promise<{ index: VaughnIndex; entries: VaughnEntry[] }> {
    const startTime = Date.now();

    console.log(`[VaughnService] Generating Vaughn Index for request: ${input.foia_request_id}`);

    // 1. Fetch FOIA request details
    const requestResult = await this.db.query(
      `SELECT id, request_number, requester_name, tenant_id
       FROM "FoiaRequests"
       WHERE id = $1 AND tenant_id = $2`,
      [input.foia_request_id, tenant_id]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    const request = requestResult.rows[0];

    // 2. Fetch all withheld documents with their redaction decisions
    const withheldDocs = await this.fetchWithheldDocuments(
      tenant_id,
      input.foia_request_id,
      input.include_only_document_ids
    );

    if (withheldDocs.length === 0) {
      throw new Error('No withheld documents found for this request');
    }

    console.log(`[VaughnService] Found ${withheldDocs.length} withheld documents`);

    // 3. Create Vaughn Index record
    const indexResult = await this.db.query(
      `INSERT INTO "FoiaVaughnIndexes" (
        tenant_id,
        foia_request_id,
        request_number,
        requester_name,
        litigation_hold_id,
        entry_count,
        total_documents_withheld,
        generated_by,
        generated_at,
        status,
        model_used,
        generation_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'DRAFT', 'claude-3-5-sonnet-20241022', 0)
      RETURNING *`,
      [
        tenant_id,
        input.foia_request_id,
        request.request_number,
        request.requester_name,
        input.litigation_hold_id || null,
        withheldDocs.length,
        withheldDocs.length,
        user_id
      ]
    );

    const index = indexResult.rows[0];

    // 4. Generate entries for each withheld document
    const entries: VaughnEntry[] = [];

    for (let i = 0; i < withheldDocs.length; i++) {
      const doc = withheldDocs[i];
      const entryNumber = i + 1;

      console.log(`[VaughnService] Generating entry ${entryNumber}/${withheldDocs.length}...`);

      try {
        const entry = await this.generateVaughnEntry(
          tenant_id,
          user_id,
          index.id,
          entryNumber,
          doc
        );
        entries.push(entry);
      } catch (error: any) {
        console.error(`[VaughnService] Failed to generate entry ${entryNumber}:`, error.message);
        // Create a placeholder entry with error
        const placeholderEntry = await this.createPlaceholderEntry(
          index.id,
          entryNumber,
          doc,
          error.message
        );
        entries.push(placeholderEntry);
      }
    }

    // 5. Update index with generation time
    const generationTime = Date.now() - startTime;
    await this.db.query(
      `UPDATE "FoiaVaughnIndexes"
       SET generation_time_ms = $1, "updatedAt" = NOW()
       WHERE id = $2`,
      [generationTime, index.id]
    );

    index.generation_time_ms = generationTime;

    // 6. Emit event
    await emit(tenant_id, 'foia.ai.vaughn.generated', {
      vaughn_index_id: index.id,
      foia_request_id: input.foia_request_id,
      document_count: entries.length,
      generation_time_ms: generationTime
    });

    console.log(`[VaughnService] ✓ Vaughn Index generated with ${entries.length} entries in ${generationTime}ms`);

    return { index, entries };
  }

  /**
   * Generate a single Vaughn Index entry using AI
   */
  private async generateVaughnEntry(
    tenant_id: string,
    user_id: string,
    vaughn_index_id: string,
    entry_number: number,
    doc: WithheldDocument
  ): Promise<VaughnEntry> {
    // Build prompt for AI
    const prompt = this.buildVaughnEntryPrompt(doc);

    // Call AI to generate entry
    const response = await this.aiClient.callWithAudit({
      tenantId: tenant_id,
      userId: user_id,
      feature: 'ai-5-vaughn-entry',
      modelId: 'claude-3-5-sonnet-20241022',
      systemPrompt: this.getVaughnSystemPrompt(),
      userMessage: prompt,
      maxTokens: 2000
    });

    // Parse AI response
    const parsedEntry = this.parseVaughnEntryResponse(response.content);

    // Store entry in database
    const result = await this.db.query(
      `INSERT INTO "FoiaVaughnEntries" (
        vaughn_index_id,
        entry_number,
        document_description,
        document_date,
        document_type,
        exemption_code,
        statutory_citation,
        exemption_explanation,
        withheld_in_full,
        segregability_explanation,
        source_document_id,
        source_redaction_id,
        ai_reasoning,
        original_entry
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        vaughn_index_id,
        entry_number,
        parsedEntry.document_description,
        doc.document_date,
        doc.document_type,
        doc.exemption_code,
        parsedEntry.statutory_citation,
        parsedEntry.exemption_explanation,
        doc.withheld_in_full,
        parsedEntry.segregability_explanation,
        doc.document_id,
        null, // source_redaction_id - could be linked if available
        doc.ai_reasoning,
        response.content // Store full AI-generated entry as original
      ]
    );

    return this.mapRowToEntry(result.rows[0]);
  }

  /**
   * Get system prompt for Vaughn entry generation
   */
  private getVaughnSystemPrompt(): string {
    return `You are a legal expert specializing in FOIA litigation and Vaughn Index preparation.

A Vaughn Index is a formal legal document required in FOIA litigation that describes each withheld document and justifies the exemption claimed. Courts reject vague or boilerplate entries.

Your task is to write formal Vaughn Index entries that meet legal standards:

1. DOCUMENT DESCRIPTION: Describe the document specifically (type, date, author, recipient, subject) WITHOUT revealing exempt content
2. EXEMPTION CITATION: Provide full statutory citation (e.g., "5 U.S.C. § 552(b)(5)")
3. EXEMPTION EXPLANATION: Explain in SPECIFIC, NON-CONCLUSORY terms why this exemption applies to THIS document
4. SEGREGABILITY: Explain whether withheld in full or part, and why segregable portions could not be released

Legal Requirements:
- Be specific to this document - no boilerplate language
- Use formal legal writing style
- Cite relevant case law if applicable
- Explain the "why" not just the "what"
- Address segregability requirements

Return your response as a structured JSON object with these fields:
{
  "document_description": "...",
  "statutory_citation": "...",
  "exemption_explanation": "...",
  "segregability_explanation": "..."
}`;
  }

  /**
   * Build prompt for a specific document
   */
  private buildVaughnEntryPrompt(doc: WithheldDocument): string {
    return `Generate a Vaughn Index entry for this withheld FOIA document:

**Document Information:**
- Type: ${doc.document_type}
- Date: ${doc.document_date ? doc.document_date.toLocaleDateString() : 'Unknown'}
- Metadata: ${JSON.stringify(doc.document_metadata || {}, null, 2)}

**Exemption Claimed:**
- Exemption Code: ${doc.exemption_code}
- Withheld: ${doc.withheld_in_full ? 'In Full' : 'In Part'}

**AI Redaction Reasoning (for context):**
${doc.ai_reasoning || 'No AI reasoning available'}

**Human Review Notes:**
${doc.redaction_notes || 'No additional notes'}

Generate a formal Vaughn Index entry that:
1. Describes this document without revealing exempt content
2. Provides full statutory citation for exemption ${doc.exemption_code}
3. Explains SPECIFICALLY why this exemption applies to THIS document
4. Addresses segregability${doc.withheld_in_full ? ' (explain why entire document must be withheld)' : ' (explain why redacted portions cannot be segregated)'}

Return as JSON with the four required fields.`;
  }

  /**
   * Parse AI response into structured entry
   */
  private parseVaughnEntryResponse(content: string): {
    document_description: string;
    statutory_citation: string;
    exemption_explanation: string;
    segregability_explanation: string;
  } {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(content);
      return {
        document_description: parsed.document_description || '',
        statutory_citation: parsed.statutory_citation || '',
        exemption_explanation: parsed.exemption_explanation || '',
        segregability_explanation: parsed.segregability_explanation || null
      };
    } catch (error) {
      // If not JSON, try to extract sections from plain text
      console.warn('[VaughnService] AI response not in JSON format, attempting to parse plain text');

      return {
        document_description: this.extractSection(content, 'document', 'description') || 'See full entry',
        statutory_citation: this.extractSection(content, 'citation', 'statute') || '',
        exemption_explanation: this.extractSection(content, 'explanation', 'exemption') || content,
        segregability_explanation: this.extractSection(content, 'segregab', 'segregat') || null
      };
    }
  }

  /**
   * Extract section from plain text response
   */
  private extractSection(text: string, ...keywords: string[]): string | null {
    const lines = text.split('\n');
    let capturing = false;
    let captured: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Check if this line starts a section
      if (keywords.some(kw => lowerLine.includes(kw))) {
        capturing = true;
        captured = [line];
        continue;
      }

      // If capturing and hit another section header, stop
      if (capturing && line.match(/^[A-Z]/)) {
        break;
      }

      if (capturing) {
        captured.push(line);
      }
    }

    return captured.length > 0 ? captured.join('\n').trim() : null;
  }

  /**
   * Create placeholder entry when AI generation fails
   */
  private async createPlaceholderEntry(
    vaughn_index_id: string,
    entry_number: number,
    doc: WithheldDocument,
    error_message: string
  ): Promise<VaughnEntry> {
    const placeholder = `[ERROR: AI generation failed - ${error_message}]\n\nDocument Type: ${doc.document_type}\nExemption: ${doc.exemption_code}\n\nThis entry requires manual completion.`;

    const result = await this.db.query(
      `INSERT INTO "FoiaVaughnEntries" (
        vaughn_index_id,
        entry_number,
        document_description,
        document_date,
        document_type,
        exemption_code,
        statutory_citation,
        exemption_explanation,
        withheld_in_full,
        segregability_explanation,
        source_document_id,
        ai_reasoning,
        original_entry
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        vaughn_index_id,
        entry_number,
        `${doc.document_type} - Requires manual entry`,
        doc.document_date,
        doc.document_type,
        doc.exemption_code,
        '[PENDING]',
        placeholder,
        doc.withheld_in_full,
        null,
        doc.document_id,
        doc.ai_reasoning,
        placeholder
      ]
    );

    return this.mapRowToEntry(result.rows[0]);
  }

  /**
   * Fetch withheld documents for a FOIA request
   */
  private async fetchWithheldDocuments(
    tenant_id: string,
    foia_request_id: string,
    document_ids?: string[]
  ): Promise<WithheldDocument[]> {
    // This is a simplified query - in production, you'd join with actual
    // redaction/exemption tables from the A-2 Document Processing module

    let query = `
      SELECT DISTINCT
        d.id as document_id,
        d.document_type,
        d.document_date,
        d.metadata as document_metadata,
        r.exemption_code,
        r.withheld_in_full,
        r.ai_reasoning,
        r.human_notes as redaction_notes,
        r.approved_by,
        r.approved_at
      FROM "FoiaDocuments" d
      JOIN "FoiaRedactions" r ON d.id = r.document_id
      WHERE d.tenant_id = $1
        AND d.foia_request_id = $2
        AND r.status = 'APPROVED'
        AND r.decision = 'REDACT'
    `;

    const params: any[] = [tenant_id, foia_request_id];

    if (document_ids && document_ids.length > 0) {
      query += ` AND d.id = ANY($3)`;
      params.push(document_ids);
    }

    query += ` ORDER BY d.document_date, d.id`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get Vaughn Index by ID
   */
  async getVaughnIndex(
    tenant_id: string,
    vaughn_index_id: string
  ): Promise<{ index: VaughnIndex; entries: VaughnEntry[] } | null> {
    // Fetch index
    const indexResult = await this.db.query(
      `SELECT * FROM "FoiaVaughnIndexes"
       WHERE id = $1 AND tenant_id = $2`,
      [vaughn_index_id, tenant_id]
    );

    if (indexResult.rows.length === 0) {
      return null;
    }

    // Fetch entries
    const entriesResult = await this.db.query(
      `SELECT * FROM "FoiaVaughnEntries"
       WHERE vaughn_index_id = $1
       ORDER BY entry_number`,
      [vaughn_index_id]
    );

    return {
      index: indexResult.rows[0],
      entries: entriesResult.rows.map(row => this.mapRowToEntry(row))
    };
  }

  /**
   * Get Vaughn Index by FOIA request ID (latest)
   */
  async getVaughnIndexByRequest(
    tenant_id: string,
    foia_request_id: string
  ): Promise<{ index: VaughnIndex; entries: VaughnEntry[] } | null> {
    const indexResult = await this.db.query(
      `SELECT * FROM "FoiaVaughnIndexes"
       WHERE tenant_id = $1 AND foia_request_id = $2
       ORDER BY generated_at DESC
       LIMIT 1`,
      [tenant_id, foia_request_id]
    );

    if (indexResult.rows.length === 0) {
      return null;
    }

    return this.getVaughnIndex(tenant_id, indexResult.rows[0].id);
  }

  /**
   * Edit a Vaughn Index entry
   */
  async editEntry(
    tenant_id: string,
    entry_id: string,
    user_id: string,
    input: EditVaughnEntryInput
  ): Promise<VaughnEntry> {
    // Fetch current entry
    const currentResult = await this.db.query(
      `SELECT ve.*, vi.tenant_id
       FROM "FoiaVaughnEntries" ve
       JOIN "FoiaVaughnIndexes" vi ON ve.vaughn_index_id = vi.id
       WHERE ve.id = $1 AND vi.tenant_id = $2`,
      [entry_id, tenant_id]
    );

    if (currentResult.rows.length === 0) {
      throw new Error('Vaughn entry not found');
    }

    const current = currentResult.rows[0];

    // Add to version history
    const versionHistory: VaughnEntryVersion[] = current.version_history || [];
    const newVersion: VaughnEntryVersion = {
      version: versionHistory.length + 1,
      entry_text: current.edited_entry || current.original_entry,
      edited_by: user_id,
      edited_at: new Date(),
      edit_notes: input.edit_notes || ''
    };
    versionHistory.push(newVersion);

    // Update entry
    const result = await this.db.query(
      `UPDATE "FoiaVaughnEntries"
       SET edited_entry = $1,
           edited_by = $2,
           edited_at = NOW(),
           edit_notes = $3,
           version_history = $4,
           "updatedAt" = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        input.entry_text,
        user_id,
        input.edit_notes || null,
        JSON.stringify(versionHistory),
        entry_id
      ]
    );

    return this.mapRowToEntry(result.rows[0]);
  }

  /**
   * Regenerate Vaughn Index
   */
  async regenerateIndex(
    tenant_id: string,
    user_id: string,
    vaughn_index_id: string,
    input: RegenerateVaughnIndexInput
  ): Promise<{ index: VaughnIndex; entries: VaughnEntry[] }> {
    // Get original index
    const original = await this.getVaughnIndex(tenant_id, vaughn_index_id);
    if (!original) {
      throw new Error('Vaughn Index not found');
    }

    // Mark original as superseded
    await this.db.query(
      `UPDATE "FoiaVaughnIndexes"
       SET status = 'SUPERSEDED', "updatedAt" = NOW()
       WHERE id = $1`,
      [vaughn_index_id]
    );

    // Generate new index
    const newIndex = await this.generateVaughnIndex(tenant_id, user_id, {
      foia_request_id: original.index.foia_request_id,
      litigation_hold_id: original.index.litigation_hold_id
    });

    // If including edited entries, copy them over
    if (input.include_updated_entries) {
      for (const oldEntry of original.entries) {
        if (oldEntry.edited_entry) {
          // Find matching entry in new index by entry number or document ID
          const newEntry = newIndex.entries.find(
            e => e.entry_number === oldEntry.entry_number ||
                 e.source_document_id === oldEntry.source_document_id
          );

          if (newEntry) {
            await this.editEntry(tenant_id, newEntry.id, user_id, {
              entry_text: oldEntry.edited_entry,
              edit_notes: 'Copied from previous version'
            });
          }
        }
      }
    }

    return newIndex;
  }

  /**
   * Map database row to VaughnEntry
   */
  private mapRowToEntry(row: any): VaughnEntry {
    return {
      id: row.id,
      vaughn_index_id: row.vaughn_index_id,
      entry_number: row.entry_number,
      document_description: row.document_description,
      document_date: row.document_date,
      document_type: row.document_type,
      exemption_code: row.exemption_code,
      statutory_citation: row.statutory_citation,
      exemption_explanation: row.exemption_explanation,
      withheld_in_full: row.withheld_in_full,
      segregability_explanation: row.segregability_explanation,
      source_document_id: row.source_document_id,
      source_redaction_id: row.source_redaction_id,
      ai_reasoning: row.ai_reasoning,
      original_entry: row.original_entry,
      edited_entry: row.edited_entry,
      edited_by: row.edited_by,
      edited_at: row.edited_at,
      edit_notes: row.edit_notes,
      version_history: row.version_history || [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
