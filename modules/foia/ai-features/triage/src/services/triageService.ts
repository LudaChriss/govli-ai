/**
 * AI-2: Autonomous Document Triage Service
 * Uses shared AI client - never instantiate Anthropic directly
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { getSharedAIClient, emit } from '@govli/foia-shared';
import {
  DocumentClassification,
  DocumentTriageResult,
  DocumentTriageOverride,
  TriageBatchRun,
  TriageAnalysisResult,
  TriageDocumentInput,
  TriageOverrideInput,
  TriageSummaryStats,
  TriageDashboardMetrics,
  OverrideCategory
} from '../types';

export class TriageService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Run triage analysis on a batch of documents for a FOIA request
   * IMPORTANT: Uses shared AI client - never instantiate Anthropic directly
   */
  async runTriageForRequest(
    tenant_id: string,
    foia_request_id: string,
    user_id: string,
    document_ids?: string[],
    force_retriage: boolean = false
  ): Promise<TriageBatchRun> {
    // Create batch run record
    const batchId = crypto.randomUUID();

    // Get documents to triage
    let documentsQuery = `
      SELECT d.id, d.filename, d.file_type, d.file_size, d.content_extract, d.page_count
      FROM "FoiaDocuments" d
      WHERE d.foia_request_id = $1
    `;

    const queryParams: any[] = [foia_request_id];

    if (document_ids && document_ids.length > 0) {
      queryParams.push(document_ids);
      documentsQuery += ` AND d.id = ANY($${queryParams.length})`;
    }

    if (!force_retriage) {
      documentsQuery += ` AND d.triage_status IS NULL`;
    }

    const documentsResult = await this.db.query(documentsQuery, queryParams);
    const documents = documentsResult.rows;

    if (documents.length === 0) {
      throw new Error('No documents found to triage');
    }

    // Create batch record
    await this.db.query(
      `INSERT INTO "FoiaDocumentTriageBatches" (
        id, foia_request_id, tenant_id, document_count, status, started_at, started_by, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'RUNNING', NOW(), $5, NOW(), NOW())`,
      [batchId, foia_request_id, tenant_id, documents.length, user_id]
    );

    let completedCount = 0;
    let failedCount = 0;
    const classifications: Record<DocumentClassification, number> = {
      LIKELY_RESPONSIVE: 0,
      LIKELY_EXEMPT: 0,
      PARTIALLY_RESPONSIVE: 0,
      NOT_RESPONSIVE: 0,
      NEEDS_REVIEW: 0,
      SENSITIVE_CONTENT: 0
    };
    let totalConfidence = 0;

    // Process documents in batches of 10 to avoid API rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);

      for (const doc of batch) {
        try {
          const result = await this.triageDocument(
            tenant_id,
            foia_request_id,
            doc,
            user_id
          );

          completedCount++;
          classifications[result.classification]++;
          totalConfidence += result.confidence_score;

          // Update document with triage status
          await this.db.query(
            `UPDATE "FoiaDocuments"
             SET triage_status = $1, triage_confidence = $2, "updatedAt" = NOW()
             WHERE id = $3`,
            [result.classification, result.confidence_score, doc.id]
          );
        } catch (error) {
          console.error(`[TriageService] Failed to triage document ${doc.id}:`, error);
          failedCount++;
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < documents.length) {
        await this.sleep(1000); // 1 second delay between batches
      }
    }

    const avgConfidence = completedCount > 0 ? totalConfidence / completedCount : 0;

    // Update batch record
    await this.db.query(
      `UPDATE "FoiaDocumentTriageBatches"
       SET completed_count = $1,
           failed_count = $2,
           status = $3,
           avg_confidence = $4,
           responsive_count = $5,
           exempt_count = $6,
           needs_review_count = $7,
           completed_at = NOW(),
           total_duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
           "updatedAt" = NOW()
       WHERE id = $8`,
      [
        completedCount,
        failedCount,
        failedCount > 0 ? 'COMPLETED' : 'COMPLETED',
        avgConfidence,
        classifications.LIKELY_RESPONSIVE + classifications.PARTIALLY_RESPONSIVE,
        classifications.LIKELY_EXEMPT,
        classifications.NEEDS_REVIEW + classifications.SENSITIVE_CONTENT,
        batchId
      ]
    );

    // Emit event (spec format: foia.ai.triage.complete)
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.ai.triage.complete',
      entity_id: foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        batch_id: batchId,
        likely: classifications.LIKELY_RESPONSIVE + classifications.PARTIALLY_RESPONSIVE,
        possibly: classifications.LIKELY_EXEMPT, // May need officer judgment on exemptions
        review_needed: classifications.NEEDS_REVIEW + classifications.SENSITIVE_CONTENT + classifications.NOT_RESPONSIVE,
        avg_confidence: avgConfidence,
        total_documents: documents.length,
        completed_count: completedCount,
        failed_count: failedCount
      },
      timestamp: new Date()
    });

    // Return batch run info
    return this.getBatchRun(batchId);
  }

  /**
   * Triage a single document using AI
   */
  private async triageDocument(
    tenant_id: string,
    foia_request_id: string,
    document: any,
    user_id?: string
  ): Promise<DocumentTriageResult> {
    const startTime = Date.now();

    // Build AI prompt
    const prompt = this.buildTriagePrompt(document);
    const systemPrompt = this.buildSystemPrompt();

    // Use shared AI client (Golden Rule #1)
    const aiClient = getSharedAIClient();

    try {
      // Call AI with audit logging (Golden Rule #4)
      const result = await aiClient.callWithAudit(
        {
          prompt,
          systemPrompt,
          maxTokens: 3000,
          temperature: 0.2, // Lower temperature for consistent classification
          model: 'claude-3-5-sonnet-20241022' // Sonnet for document analysis
        },
        'AI-2', // Autonomous Document Triage
        tenant_id,
        foia_request_id,
        {
          foia_request_id,
          score: 60, // Medium-high complexity for document analysis
          factors: {
            date_range_years: 0,
            agency_count: 1,
            estimated_volume: 'MEDIUM',
            requester_category: 'individual',
            keyword_complexity: 60
          },
          calculated_at: new Date()
        }
      );

      const latencyMs = Date.now() - startTime;

      // Parse AI response (Golden Rule #2 - handles JSON parsing failures)
      let analysisResult: TriageAnalysisResult;
      try {
        // Extract JSON from response (may have markdown code fences)
        const jsonMatch = result.content.match(/```json\n([\s\S]*?)\n```/) ||
                         result.content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const jsonStr = jsonMatch[1] || jsonMatch[0];
          analysisResult = JSON.parse(jsonStr);
        } else {
          analysisResult = JSON.parse(result.content);
        }
      } catch (error) {
        console.error('[TriageService] Failed to parse AI response:', error);
        throw new Error('Failed to parse AI triage analysis');
      }

      // Validate analysis result structure
      if (!this.isValidTriageResult(analysisResult)) {
        throw new Error('Invalid AI triage result structure');
      }

      // Store triage result in database
      const triageId = crypto.randomUUID();

      const insertResult = await this.db.query(
        `INSERT INTO "FoiaDocumentTriageResults" (
          id, foia_request_id, document_id, tenant_id,
          classification, confidence_score, reasoning,
          key_findings, sensitivity_flags, suggested_exemptions, suggested_redactions,
          estimated_redaction_effort,
          model_used, prompt_tokens, completion_tokens, latency_ms,
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *`,
        [
          triageId,
          foia_request_id,
          document.id,
          tenant_id,
          analysisResult.classification,
          analysisResult.confidence_score,
          analysisResult.reasoning,
          JSON.stringify(analysisResult.key_findings || []),
          JSON.stringify(analysisResult.sensitivity_flags || []),
          JSON.stringify(analysisResult.suggested_exemptions || []),
          JSON.stringify(analysisResult.suggested_redactions || []),
          analysisResult.estimated_redaction_effort,
          result.model,
          result.usage?.inputTokens || 0,
          result.usage?.outputTokens || 0,
          latencyMs
        ]
      );

      const triageResult = this.mapToTriageResult(insertResult.rows[0]);

      // Emit event for analytics (Golden Rule #4)
      await emit({
        id: crypto.randomUUID(),
        tenant_id,
        event_type: 'foia.ai.triage.document_analyzed',
        entity_id: document.id,
        entity_type: 'foia_document',
        user_id,
        metadata: {
          triage_id: triageId,
          foia_request_id,
          classification: analysisResult.classification,
          confidence_score: analysisResult.confidence_score,
          has_exemptions: analysisResult.suggested_exemptions.length > 0,
          has_redactions: analysisResult.suggested_redactions.length > 0
        },
        timestamp: new Date()
      });

      return triageResult;
    } catch (error) {
      console.error('[TriageService] Triage failed:', error);
      throw error;
    }
  }

  /**
   * Get triage result for a specific document
   */
  async getTriageResult(
    tenant_id: string,
    document_id: string
  ): Promise<DocumentTriageResult | null> {
    const result = await this.db.query(
      `SELECT tr.* FROM "FoiaDocumentTriageResults" tr
       JOIN "FoiaRequests" fr ON fr.id = tr.foia_request_id
       WHERE tr.document_id = $1 AND fr.tenant_id = $2`,
      [document_id, tenant_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToTriageResult(result.rows[0]);
  }

  /**
   * Get all triage results for a request
   */
  async getTriageResultsForRequest(
    tenant_id: string,
    foia_request_id: string
  ): Promise<DocumentTriageResult[]> {
    const result = await this.db.query(
      `SELECT tr.* FROM "FoiaDocumentTriageResults" tr
       JOIN "FoiaRequests" fr ON fr.id = tr.foia_request_id
       WHERE tr.foia_request_id = $1 AND fr.tenant_id = $2
       ORDER BY tr."createdAt" DESC`,
      [foia_request_id, tenant_id]
    );

    return result.rows.map(row => this.mapToTriageResult(row));
  }

  /**
   * Override AI triage decision with human classification
   * Golden Rule #3: Human-in-the-loop for final decisions
   */
  async overrideTriageResult(
    tenant_id: string,
    document_id: string,
    user_id: string,
    input: TriageOverrideInput
  ): Promise<DocumentTriageOverride> {
    // Get current triage result
    const triageResult = await this.getTriageResult(tenant_id, document_id);
    if (!triageResult) {
      throw new Error('No triage result found for this document');
    }

    // Create override record
    const overrideId = crypto.randomUUID();

    const insertResult = await this.db.query(
      `INSERT INTO "FoiaDocumentTriageOverrides" (
        id, triage_result_id, foia_request_id, document_id, tenant_id,
        ai_classification, human_classification, override_reason, override_category,
        overridden_by, overridden_at, ai_confidence, feedback_for_training,
        "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, NOW())
      RETURNING *`,
      [
        overrideId,
        triageResult.id,
        triageResult.foia_request_id,
        document_id,
        tenant_id,
        triageResult.classification,
        input.human_classification,
        input.override_reason,
        input.override_category,
        user_id,
        triageResult.confidence_score,
        input.feedback_for_training || false
      ]
    );

    // Update triage result with override
    await this.db.query(
      `UPDATE "FoiaDocumentTriageResults"
       SET reviewed_by = $1,
           reviewed_at = NOW(),
           final_classification = $2,
           override_reason = $3,
           "updatedAt" = NOW()
       WHERE id = $4`,
      [user_id, input.human_classification, input.override_reason, triageResult.id]
    );

    // Update document triage status
    await this.db.query(
      `UPDATE "FoiaDocuments"
       SET triage_status = $1, "updatedAt" = NOW()
       WHERE id = $2`,
      [input.human_classification, document_id]
    );

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.ai.triage.override_recorded',
      entity_id: document_id,
      entity_type: 'foia_document',
      user_id,
      metadata: {
        override_id: overrideId,
        ai_classification: triageResult.classification,
        human_classification: input.human_classification,
        override_category: input.override_category,
        ai_confidence: triageResult.confidence_score
      },
      timestamp: new Date()
    });

    return this.mapToOverride(insertResult.rows[0]);
  }

  /**
   * Get batch run information
   */
  async getBatchRun(batch_id: string): Promise<TriageBatchRun> {
    const result = await this.db.query(
      `SELECT * FROM "FoiaDocumentTriageBatches" WHERE id = $1`,
      [batch_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Batch run not found');
    }

    return this.mapToBatchRun(result.rows[0]);
  }

  /**
   * Get summary statistics for a request
   */
  async getSummaryStats(
    tenant_id: string,
    foia_request_id: string
  ): Promise<TriageSummaryStats> {
    // Get total documents
    const docsResult = await this.db.query(
      `SELECT COUNT(*) as total FROM "FoiaDocuments" d
       JOIN "FoiaRequests" fr ON fr.id = d.foia_request_id
       WHERE d.foia_request_id = $1 AND fr.tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    const totalDocuments = parseInt(docsResult.rows[0].total);

    // Get triage stats
    const triageStatsResult = await this.db.query(
      `SELECT
        COUNT(*) as triaged_count,
        AVG(confidence_score) as avg_confidence,
        classification,
        SUM(CASE WHEN confidence_score > 0.8 THEN 1 ELSE 0 END) as high_conf,
        SUM(CASE WHEN confidence_score < 0.5 THEN 1 ELSE 0 END) as low_conf
       FROM "FoiaDocumentTriageResults" tr
       JOIN "FoiaRequests" fr ON fr.id = tr.foia_request_id
       WHERE tr.foia_request_id = $1 AND fr.tenant_id = $2
       GROUP BY classification`,
      [foia_request_id, tenant_id]
    );

    let triagedDocuments = 0;
    let totalConfidence = 0;
    let highConfCount = 0;
    let lowConfCount = 0;
    const classificationBreakdown: Record<DocumentClassification, number> = {
      LIKELY_RESPONSIVE: 0,
      LIKELY_EXEMPT: 0,
      PARTIALLY_RESPONSIVE: 0,
      NOT_RESPONSIVE: 0,
      NEEDS_REVIEW: 0,
      SENSITIVE_CONTENT: 0
    };

    triageStatsResult.rows.forEach(row => {
      const count = parseInt(row.triaged_count);
      triagedDocuments += count;
      totalConfidence += parseFloat(row.avg_confidence) * count;
      classificationBreakdown[row.classification as DocumentClassification] = count;
      highConfCount += parseInt(row.high_conf);
      lowConfCount += parseInt(row.low_conf);
    });

    const avgConfidence = triagedDocuments > 0 ? totalConfidence / triagedDocuments : 0;

    // Get override stats
    const overrideResult = await this.db.query(
      `SELECT COUNT(*) as override_count
       FROM "FoiaDocumentTriageOverrides" o
       JOIN "FoiaRequests" fr ON fr.id = o.foia_request_id
       WHERE o.foia_request_id = $1 AND fr.tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    const overrideCount = parseInt(overrideResult.rows[0].override_count);
    const overrideRate = triagedDocuments > 0 ? (overrideCount / triagedDocuments) * 100 : 0;

    return {
      total_documents: totalDocuments,
      triaged_documents: triagedDocuments,
      pending_documents: totalDocuments - triagedDocuments,
      classification_breakdown: classificationBreakdown,
      avg_confidence: avgConfidence,
      high_confidence_count: highConfCount,
      low_confidence_count: lowConfCount,
      documents_needing_review: classificationBreakdown.NEEDS_REVIEW + classificationBreakdown.SENSITIVE_CONTENT,
      sensitive_documents: classificationBreakdown.SENSITIVE_CONTENT,
      override_count: overrideCount,
      override_rate: overrideRate
    };
  }

  /**
   * Build AI triage prompt for a document
   * Uses smart truncation for large documents (first 3000 + last 1000 + middle 1000)
   */
  private buildTriagePrompt(document: any): string {
    let prompt = `Analyze this document for FOIA response triage:\n\n`;

    prompt += `DOCUMENT METADATA:\n`;
    prompt += `Filename: ${document.filename}\n`;
    prompt += `File Type: ${document.file_type}\n`;
    if (document.page_count) {
      prompt += `Pages: ${document.page_count}\n`;
    }
    prompt += `\n`;

    if (document.content_extract) {
      const truncatedContent = this.smartTruncateText(document.content_extract);
      prompt += `DOCUMENT CONTENT:\n${truncatedContent}\n\n`;
    } else {
      prompt += `Note: Full document content not available. Analyze based on metadata only.\n\n`;
    }

    prompt += `Perform a thorough triage analysis of this document.`;

    return prompt;
  }

  /**
   * Smart text truncation for large documents
   * If > 8000 chars: first 3000 + middle 1000 + last 1000
   * Otherwise: return as-is
   */
  private smartTruncateText(text: string): string {
    if (text.length <= 8000) {
      return text;
    }

    const first = text.substring(0, 3000);
    const last = text.substring(text.length - 1000);
    const middleStart = Math.floor((text.length - 1000) / 2);
    const middle = text.substring(middleStart, middleStart + 1000);

    return `${first}\n\n[... TRUNCATED - showing beginning, middle section, and end ...]\n\n${middle}\n\n[... TRUNCATED - showing end ...]\n\n${last}`;
  }

  /**
   * Utility: Sleep for ms (used for batch rate limiting)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build system prompt for AI
   * Golden Rule #2: "JSON only" in every AI system prompt
   */
  private buildSystemPrompt(): string {
    return `You are a FOIA document triage specialist analyzing documents for responsiveness, exemptions, and sensitivity.

Analyze the document and return a JSON object with the following structure:

{
  "classification": "LIKELY_RESPONSIVE" | "LIKELY_EXEMPT" | "PARTIALLY_RESPONSIVE" | "NOT_RESPONSIVE" | "NEEDS_REVIEW" | "SENSITIVE_CONTENT",
  "confidence_score": 0.0-1.0,
  "reasoning": "clear explanation of classification decision",
  "key_findings": [
    {
      "type": "KEYWORD" | "DATE" | "PERSON" | "TOPIC" | "ENTITY",
      "content": "the finding",
      "relevance": "HIGH" | "MEDIUM" | "LOW",
      "page": page_number_if_available
    }
  ],
  "sensitivity_flags": [
    {
      "type": "PII" | "SSN" | "CONFIDENTIAL" | "PROPRIETARY" | "LAW_ENFORCEMENT" | "MEDICAL" | "FINANCIAL",
      "description": "what was found",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "locations": ["page references"]
    }
  ],
  "suggested_exemptions": [
    {
      "code": "exemption code (e.g., 5 U.S.C. § 552(b)(5))",
      "category": "category name",
      "reasoning": "why this exemption applies",
      "confidence": 0.0-1.0,
      "affected_pages": [page_numbers]
    }
  ],
  "suggested_redactions": [
    {
      "page": page_number,
      "region": "description of location",
      "content_preview": "first few chars",
      "reason": "why redact",
      "exemption_code": "applicable exemption"
    }
  ],
  "estimated_redaction_effort": "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTENSIVE",
  "processing_notes": "additional notes for human reviewer"
}

CLASSIFICATION GUIDELINES:
- LIKELY_RESPONSIVE: Document clearly relates to the request and should be disclosed
- LIKELY_EXEMPT: Document is responsive but likely fully exempt from disclosure
- PARTIALLY_RESPONSIVE: Document contains both responsive and non-responsive content
- NOT_RESPONSIVE: Document does not relate to the FOIA request
- NEEDS_REVIEW: Unclear classification, requires human judgment
- SENSITIVE_CONTENT: Contains highly sensitive information requiring careful review

CONFIDENCE SCORING:
- High confidence (>0.8): Clear classification with strong evidence
- Medium confidence (0.5-0.8): Reasonable classification with some ambiguity
- Low confidence (<0.5): Uncertain, definitely needs human review

Be thorough in identifying PII, sensitive information, and applicable exemptions.
Focus on FOIA-specific concerns (privacy, deliberative process, law enforcement, etc.).

ONLY return valid JSON. No prose before or after the JSON object.`;
  }

  /**
   * Validate AI triage result structure
   */
  private isValidTriageResult(result: any): result is TriageAnalysisResult {
    return (
      result &&
      typeof result.classification === 'string' &&
      typeof result.confidence_score === 'number' &&
      typeof result.reasoning === 'string' &&
      Array.isArray(result.key_findings) &&
      Array.isArray(result.sensitivity_flags) &&
      Array.isArray(result.suggested_exemptions) &&
      Array.isArray(result.suggested_redactions) &&
      typeof result.estimated_redaction_effort === 'string'
    );
  }

  /**
   * Map database row to DocumentTriageResult object
   */
  private mapToTriageResult(row: any): DocumentTriageResult {
    return {
      id: row.id,
      foia_request_id: row.foia_request_id,
      document_id: row.document_id,
      tenant_id: row.tenant_id,
      classification: row.classification,
      confidence_score: parseFloat(row.confidence_score),
      reasoning: row.reasoning,
      key_findings: typeof row.key_findings === 'string'
        ? JSON.parse(row.key_findings)
        : row.key_findings || [],
      sensitivity_flags: typeof row.sensitivity_flags === 'string'
        ? JSON.parse(row.sensitivity_flags)
        : row.sensitivity_flags || [],
      suggested_exemptions: typeof row.suggested_exemptions === 'string'
        ? JSON.parse(row.suggested_exemptions)
        : row.suggested_exemptions || [],
      suggested_redactions: typeof row.suggested_redactions === 'string'
        ? JSON.parse(row.suggested_redactions)
        : row.suggested_redactions || [],
      estimated_redaction_effort: row.estimated_redaction_effort,
      model_used: row.model_used,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      latency_ms: row.latency_ms,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      final_classification: row.final_classification,
      override_reason: row.override_reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Map database row to DocumentTriageOverride object
   */
  private mapToOverride(row: any): DocumentTriageOverride {
    return {
      id: row.id,
      triage_result_id: row.triage_result_id,
      foia_request_id: row.foia_request_id,
      document_id: row.document_id,
      tenant_id: row.tenant_id,
      ai_classification: row.ai_classification,
      human_classification: row.human_classification,
      override_reason: row.override_reason,
      override_category: row.override_category,
      overridden_by: row.overridden_by,
      overridden_at: row.overridden_at,
      ai_confidence: parseFloat(row.ai_confidence),
      feedback_for_training: row.feedback_for_training,
      createdAt: row.createdAt
    };
  }

  /**
   * Map database row to TriageBatchRun object
   */
  private mapToBatchRun(row: any): TriageBatchRun {
    return {
      id: row.id,
      foia_request_id: row.foia_request_id,
      tenant_id: row.tenant_id,
      document_count: row.document_count,
      completed_count: row.completed_count,
      failed_count: row.failed_count,
      status: row.status,
      avg_confidence: row.avg_confidence ? parseFloat(row.avg_confidence) : undefined,
      responsive_count: row.responsive_count || 0,
      exempt_count: row.exempt_count || 0,
      needs_review_count: row.needs_review_count || 0,
      started_at: row.started_at,
      completed_at: row.completed_at,
      total_duration_ms: row.total_duration_ms,
      error_message: row.error_message,
      started_by: row.started_by,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
