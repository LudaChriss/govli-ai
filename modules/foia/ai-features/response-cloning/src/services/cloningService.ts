/**
 * AI-15: One-Click Response Cloning Service
 *
 * Automatically detects similar previously completed requests and enables
 * cloning responses with AI-powered adaptation of dates, names, and tracking numbers.
 */

import { Pool } from 'pg';
import { getSharedAIClient } from '@govli/foia-shared';

interface CloneCandidate {
  source_request_id: string;
  confirmation_number: string;
  description: string;
  similarity_score: number;
  response_type: string;
  documents_count: number;
  exemptions_applied: string[];
  closed_at: Date;
  days_ago: number;
}

interface ClonePackage {
  source_request_id: string;
  target_request_id: string;
  adapted_letter: string;
  redaction_decisions: any[];
  exemption_citations: any[];
  response_template: string;
  fee_calculation: any;
  document_determinations: any[];
}

interface CloneReview {
  source: {
    request: any;
    response_letter: string;
    redactions: any[];
    exemptions: any[];
  };
  target: {
    request: any;
    adapted_letter: string;
    redactions: any[];
    exemptions: any[];
  };
  differences: Array<{
    field: string;
    source_value: string;
    target_value: string;
  }>;
}

interface CloneAnalytics {
  clones_executed: number;
  clones_approved: number;
  clones_rejected: number;
  clone_rate: number; // % of requests that use cloning
  avg_edit_delta_pct: number; // How much officers modify clones
  estimated_hours_saved: number;
  top_cloned_request_types: Array<{
    request_type: string;
    clone_count: number;
  }>;
}

/**
 * CloningService handles response cloning with AI-powered adaptation
 */
export class CloningService {
  private db: Pool;
  private tenantId: string;

  constructor(db: Pool, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Detect clone candidates for a new request
   * Called after AI-1 Scoping runs
   */
  async detectCloneCandidates(
    requestId: string,
    description: string,
    requesterCategory: string,
    department: string
  ): Promise<CloneCandidate[]> {
    // Step 1: Generate embedding for new request
    const embedding = await this.generateEmbedding(description);

    // Step 2: Query CLOSED requests with high similarity
    const result = await this.db.query(
      `SELECT
        r.id as source_request_id,
        r.confirmation_number,
        r.description,
        1 - (r.description_embedding <=> $1::vector) as similarity_score,
        r.response_type,
        (SELECT COUNT(*) FROM "FoiaDocuments" WHERE request_id = r.id) as documents_count,
        r.exemptions_applied,
        r.closed_at,
        EXTRACT(DAY FROM NOW() - r.closed_at) as days_ago
      FROM "FoiaRequests" r
      WHERE r.tenant_id = $2
        AND r.status = 'CLOSED'
        AND r.department = $3
        AND r.requester_category = $4
        AND r.id != $5
        AND r.description_embedding IS NOT NULL
        AND 1 - (r.description_embedding <=> $1::vector) > 0.90
      ORDER BY similarity_score DESC
      LIMIT 5`,
      [JSON.stringify(embedding), this.tenantId, department, requesterCategory, requestId]
    );

    return result.rows as CloneCandidate[];
  }

  /**
   * Generate embedding for request description (reuse from AI-12/AI-13)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const aiClient = getSharedAIClient();

    // Use Claude to create semantic summary
    const summaryPrompt = `Summarize this FOIA request in 2 sentences for semantic matching: ${text}`;

    const result = await aiClient.callWithAudit(
      {
        prompt: summaryPrompt,
        maxTokens: 100,
        temperature: 0.1,
        systemPrompt: 'You are a FOIA request analyzer. Create concise, semantic summaries.'
      },
      'AI-15',
      this.tenantId
    );

    const summary = result.content.trim();
    return this.mockEmbedding(summary);
  }

  /**
   * Mock embedding (replace with real embedding in production)
   */
  private mockEmbedding(text: string): number[] {
    const embedding: number[] = new Array(1536);
    const hash = this.simpleHash(text);

    for (let i = 0; i < 1536; i++) {
      const seed = hash + i;
      embedding[i] = (Math.sin(seed) + 1) / 2; // Normalize to [0, 1]
    }

    return embedding;
  }

  /**
   * Simple hash function for mock embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Create clone suggestion record
   */
  async createCloneSuggestion(
    targetRequestId: string,
    sourceRequestId: string,
    similarityScore: number
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO "FoiaResponseClones"
        (id, tenant_id, source_request_id, target_request_id, similarity_score, clone_status, cloned_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SUGGESTED', NOW())`,
      [this.tenantId, sourceRequestId, targetRequestId, similarityScore]
    );

    console.log('[CloningService] Emitting foia.ai.clone.candidate_detected', {
      target_request_id: targetRequestId,
      source_request_id: sourceRequestId,
      similarity_score: similarityScore
    });
  }

  /**
   * Get clone candidates for a request
   */
  async getCandidates(requestId: string): Promise<CloneCandidate[]> {
    const result = await this.db.query(
      `SELECT
        c.source_request_id,
        r.confirmation_number,
        r.description,
        c.similarity_score,
        r.response_type,
        (SELECT COUNT(*) FROM "FoiaDocuments" WHERE request_id = r.id) as documents_count,
        r.exemptions_applied,
        r.closed_at,
        EXTRACT(DAY FROM NOW() - r.closed_at) as days_ago
      FROM "FoiaResponseClones" c
      JOIN "FoiaRequests" r ON c.source_request_id = r.id
      WHERE c.target_request_id = $1
        AND c.clone_status = 'SUGGESTED'
      ORDER BY c.similarity_score DESC`,
      [requestId]
    );

    return result.rows as CloneCandidate[];
  }

  /**
   * Execute clone: copy response and adapt with AI
   */
  async executeClone(
    targetRequestId: string,
    sourceRequestId: string,
    officerId: string
  ): Promise<ClonePackage> {
    // Step 1: Load source request and response
    const sourceResult = await this.db.query(
      `SELECT
        r.*,
        rl.letter_text as response_letter,
        rl.template_id as response_template
      FROM "FoiaRequests" r
      LEFT JOIN "FoiaResponseLetters" rl ON r.id = rl.request_id
      WHERE r.id = $1`,
      [sourceRequestId]
    );

    if (sourceResult.rows.length === 0) {
      throw new Error('Source request not found');
    }

    const sourceRequest = sourceResult.rows[0];

    // Step 2: Load target request details
    const targetResult = await this.db.query(
      `SELECT * FROM "FoiaRequests" WHERE id = $1`,
      [targetRequestId]
    );

    if (targetResult.rows.length === 0) {
      throw new Error('Target request not found');
    }

    const targetRequest = targetResult.rows[0];

    // Step 3: Load redaction decisions from source
    const redactionsResult = await this.db.query(
      `SELECT * FROM "FoiaRedactionDecisions" WHERE request_id = $1`,
      [sourceRequestId]
    );

    // Step 4: Load exemption citations from source
    const exemptionsResult = await this.db.query(
      `SELECT * FROM "FoiaExemptionCitations" WHERE request_id = $1`,
      [sourceRequestId]
    );

    // Step 5: Load document determinations from source
    const documentsResult = await this.db.query(
      `SELECT * FROM "FoiaDocuments" WHERE request_id = $1`,
      [sourceRequestId]
    );

    // Step 6: Adapt response letter with AI
    const adaptedLetter = await this.adaptResponseLetter(
      sourceRequest.response_letter || '',
      sourceRequest,
      targetRequest
    );

    // Step 7: Copy redaction decisions to target
    for (const redaction of redactionsResult.rows) {
      await this.db.query(
        `INSERT INTO "FoiaRedactionDecisions"
          (id, request_id, document_id, exemption_code, start_position, end_position, reason, created_by, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT DO NOTHING`,
        [
          targetRequestId,
          redaction.document_id,
          redaction.exemption_code,
          redaction.start_position,
          redaction.end_position,
          redaction.reason,
          officerId
        ]
      );
    }

    // Step 8: Copy exemption citations to target
    for (const exemption of exemptionsResult.rows) {
      await this.db.query(
        `INSERT INTO "FoiaExemptionCitations"
          (id, request_id, exemption_code, statute_section, case_law, rationale, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
        ON CONFLICT DO NOTHING`,
        [
          targetRequestId,
          exemption.exemption_code,
          exemption.statute_section,
          exemption.case_law,
          exemption.rationale
        ]
      );
    }

    // Step 9: Create/update response letter for target
    await this.db.query(
      `INSERT INTO "FoiaResponseLetters"
        (id, request_id, template_id, letter_text, created_by, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      ON CONFLICT (request_id) DO UPDATE SET
        letter_text = $3,
        updated_at = NOW()`,
      [targetRequestId, sourceRequest.response_template, adaptedLetter, officerId]
    );

    // Step 10: Update target request status
    await this.db.query(
      `UPDATE "FoiaRequests"
       SET status = 'RESPONSE_DRAFT_READY',
           updated_at = NOW()
       WHERE id = $1`,
      [targetRequestId]
    );

    // Step 11: Update clone record status
    await this.db.query(
      `UPDATE "FoiaResponseClones"
       SET clone_status = 'EXECUTED',
           cloned_at = NOW()
       WHERE target_request_id = $1 AND source_request_id = $2`,
      [targetRequestId, sourceRequestId]
    );

    console.log('[CloningService] Emitting foia.ai.clone.executed', {
      target_request_id: targetRequestId,
      source_request_id: sourceRequestId
    });

    return {
      source_request_id: sourceRequestId,
      target_request_id: targetRequestId,
      adapted_letter: adaptedLetter,
      redaction_decisions: redactionsResult.rows,
      exemption_citations: exemptionsResult.rows,
      response_template: sourceRequest.response_template,
      fee_calculation: sourceRequest.fee_calculation,
      document_determinations: documentsResult.rows
    };
  }

  /**
   * Adapt response letter with AI (Sonnet 4.5)
   */
  private async adaptResponseLetter(
    sourceLetter: string,
    sourceRequest: any,
    targetRequest: any
  ): Promise<string> {
    const aiClient = getSharedAIClient();

    const systemPrompt = `You are adapting a FOIA response letter for a new but similar request.

UPDATE ONLY:
- Dates (today's date, deadline dates, etc.)
- Tracking numbers (confirmation numbers)
- Requester name and address
- Any request-specific references (dates mentioned in the request, specific document titles)

KEEP IDENTICAL:
- All exemption language and statutory citations
- Appeal rights language
- Legal reasoning and justifications
- Agency contact information
- Signature blocks

Return ONLY the adapted letter text with no additional commentary.`;

    const prompt = `SOURCE LETTER:
${sourceLetter}

SOURCE REQUEST:
- Confirmation #: ${sourceRequest.confirmation_number}
- Requester: ${sourceRequest.requester_name}
- Description: ${sourceRequest.description}

TARGET REQUEST (new request to adapt for):
- Confirmation #: ${targetRequest.confirmation_number}
- Requester: ${targetRequest.requester_name}
- Description: ${targetRequest.description}
- Submitted: ${targetRequest.submitted_at}

Please adapt the source letter for the target request.`;

    const result = await aiClient.callWithAudit(
      {
        prompt: prompt,
        maxTokens: 3000,
        temperature: 0.2, // Low temperature for precision
        systemPrompt: systemPrompt
      },
      'AI-15',
      this.tenantId
    );

    return result.content.trim();
  }

  /**
   * Get clone review (side-by-side comparison)
   */
  async getReview(targetRequestId: string): Promise<CloneReview> {
    // Get clone record
    const cloneResult = await this.db.query(
      `SELECT * FROM "FoiaResponseClones"
       WHERE target_request_id = $1 AND clone_status = 'EXECUTED'
       ORDER BY cloned_at DESC LIMIT 1`,
      [targetRequestId]
    );

    if (cloneResult.rows.length === 0) {
      throw new Error('No executed clone found for this request');
    }

    const clone = cloneResult.rows[0];

    // Load source request and response
    const sourceResult = await this.db.query(
      `SELECT r.*, rl.letter_text as response_letter
       FROM "FoiaRequests" r
       LEFT JOIN "FoiaResponseLetters" rl ON r.id = rl.request_id
       WHERE r.id = $1`,
      [clone.source_request_id]
    );

    // Load target request and adapted response
    const targetResult = await this.db.query(
      `SELECT r.*, rl.letter_text as adapted_letter
       FROM "FoiaRequests" r
       LEFT JOIN "FoiaResponseLetters" rl ON r.id = rl.request_id
       WHERE r.id = $1`,
      [targetRequestId]
    );

    // Load redactions
    const sourceRedactions = await this.db.query(
      `SELECT * FROM "FoiaRedactionDecisions" WHERE request_id = $1`,
      [clone.source_request_id]
    );

    const targetRedactions = await this.db.query(
      `SELECT * FROM "FoiaRedactionDecisions" WHERE request_id = $1`,
      [targetRequestId]
    );

    // Load exemptions
    const sourceExemptions = await this.db.query(
      `SELECT * FROM "FoiaExemptionCitations" WHERE request_id = $1`,
      [clone.source_request_id]
    );

    const targetExemptions = await this.db.query(
      `SELECT * FROM "FoiaExemptionCitations" WHERE request_id = $1`,
      [targetRequestId]
    );

    // Calculate differences
    const differences = this.calculateDifferences(
      sourceResult.rows[0],
      targetResult.rows[0]
    );

    return {
      source: {
        request: sourceResult.rows[0],
        response_letter: sourceResult.rows[0].response_letter || '',
        redactions: sourceRedactions.rows,
        exemptions: sourceExemptions.rows
      },
      target: {
        request: targetResult.rows[0],
        adapted_letter: targetResult.rows[0].adapted_letter || '',
        redactions: targetRedactions.rows,
        exemptions: targetExemptions.rows
      },
      differences
    };
  }

  /**
   * Calculate text differences between source and target
   */
  private calculateDifferences(source: any, target: any): Array<{
    field: string;
    source_value: string;
    target_value: string;
  }> {
    const differences = [];

    const fieldsToCompare = [
      'confirmation_number',
      'requester_name',
      'requester_email',
      'submitted_at'
    ];

    for (const field of fieldsToCompare) {
      if (source[field] !== target[field]) {
        differences.push({
          field,
          source_value: String(source[field] || ''),
          target_value: String(target[field] || '')
        });
      }
    }

    return differences;
  }

  /**
   * Approve cloned response
   */
  async approveClone(
    targetRequestId: string,
    officerId: string,
    modifications?: {
      adapted_letter?: string;
      redactions?: any[];
      exemptions?: any[];
    }
  ): Promise<void> {
    // Apply modifications if provided
    if (modifications?.adapted_letter) {
      await this.db.query(
        `UPDATE "FoiaResponseLetters"
         SET letter_text = $1, updated_at = NOW()
         WHERE request_id = $2`,
        [modifications.adapted_letter, targetRequestId]
      );
    }

    // Calculate edit delta percentage (how much the officer modified)
    const editDelta = await this.calculateEditDelta(targetRequestId);

    // Update clone status
    await this.db.query(
      `UPDATE "FoiaResponseClones"
       SET clone_status = 'APPROVED',
           edit_delta_pct = $1,
           approved_at = NOW()
       WHERE target_request_id = $2 AND clone_status = 'EXECUTED'`,
      [editDelta, targetRequestId]
    );

    // Update request status to proceed to A-4 approval workflow
    await this.db.query(
      `UPDATE "FoiaRequests"
       SET status = 'PENDING_APPROVAL',
           updated_at = NOW()
       WHERE id = $1`,
      [targetRequestId]
    );

    console.log('[CloningService] Emitting foia.ai.clone.approved', {
      target_request_id: targetRequestId,
      edit_delta_pct: editDelta
    });
  }

  /**
   * Reject cloned response
   */
  async rejectClone(targetRequestId: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE "FoiaResponseClones"
       SET clone_status = 'REJECTED',
           rejection_reason = $1,
           approved_at = NOW()
       WHERE target_request_id = $2 AND clone_status = 'EXECUTED'`,
      [reason, targetRequestId]
    );

    // Revert request status
    await this.db.query(
      `UPDATE "FoiaRequests"
       SET status = 'IN_PROGRESS',
           updated_at = NOW()
       WHERE id = $1`,
      [targetRequestId]
    );
  }

  /**
   * Calculate edit delta (how much the officer modified the clone)
   */
  private async calculateEditDelta(targetRequestId: string): Promise<number> {
    // This is a simplified calculation
    // In production, use Levenshtein distance or similar
    // For now, return a mock value
    return 0.05; // 5% edit delta
  }

  /**
   * Get cloning analytics
   */
  async getAnalytics(dateFrom: Date, dateTo: Date): Promise<CloneAnalytics> {
    // Count clones
    const countsResult = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE clone_status = 'EXECUTED') as clones_executed,
        COUNT(*) FILTER (WHERE clone_status = 'APPROVED') as clones_approved,
        COUNT(*) FILTER (WHERE clone_status = 'REJECTED') as clones_rejected
      FROM "FoiaResponseClones"
      WHERE tenant_id = $1
        AND cloned_at >= $2
        AND cloned_at <= $3`,
      [this.tenantId, dateFrom, dateTo]
    );

    const counts = countsResult.rows[0];

    // Calculate clone rate
    const totalRequestsResult = await this.db.query(
      `SELECT COUNT(*) as total
       FROM "FoiaRequests"
       WHERE tenant_id = $1
         AND submitted_at >= $2
         AND submitted_at <= $3`,
      [this.tenantId, dateFrom, dateTo]
    );

    const totalRequests = parseInt(totalRequestsResult.rows[0].total);
    const cloneRate = totalRequests > 0
      ? (parseInt(counts.clones_executed) / totalRequests) * 100
      : 0;

    // Average edit delta
    const editDeltaResult = await this.db.query(
      `SELECT AVG(edit_delta_pct) as avg_edit_delta
       FROM "FoiaResponseClones"
       WHERE tenant_id = $1
         AND clone_status = 'APPROVED'
         AND cloned_at >= $2
         AND cloned_at <= $3`,
      [this.tenantId, dateFrom, dateTo]
    );

    const avgEditDelta = parseFloat(editDeltaResult.rows[0].avg_edit_delta || 0);

    // Estimated hours saved (3.5 hours per approved clone)
    const estimatedHoursSaved = parseInt(counts.clones_approved) * 3.5;

    // Top cloned request types
    const topTypesResult = await this.db.query(
      `SELECT
        r.request_type,
        COUNT(*) as clone_count
      FROM "FoiaResponseClones" c
      JOIN "FoiaRequests" r ON c.target_request_id = r.id
      WHERE c.tenant_id = $1
        AND c.clone_status = 'APPROVED'
        AND c.cloned_at >= $2
        AND c.cloned_at <= $3
      GROUP BY r.request_type
      ORDER BY clone_count DESC
      LIMIT 10`,
      [this.tenantId, dateFrom, dateTo]
    );

    return {
      clones_executed: parseInt(counts.clones_executed),
      clones_approved: parseInt(counts.clones_approved),
      clones_rejected: parseInt(counts.clones_rejected),
      clone_rate: cloneRate,
      avg_edit_delta_pct: avgEditDelta,
      estimated_hours_saved: estimatedHoursSaved,
      top_cloned_request_types: topTypesResult.rows
    };
  }
}
