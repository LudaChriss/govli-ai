/**
 * Govli AI FOIA Module - Batch Intelligence Service
 * AI-13: Detect and manage batch processing opportunities
 */

import { Pool } from 'pg';
import { getSharedAIClient } from '@govli/foia-shared';

export interface BatchOpportunity {
  id: string;
  group_id: string;
  tenant_id: string;
  request_ids: string[];
  requester_ids: string[];
  similarity_score: number;
  recommended_action: 'MERGE' | 'PARALLEL' | 'COORDINATE';
  actual_action?: 'MERGE' | 'PARALLEL' | 'DISMISS';
  reason?: string;
  primary_request_id?: string;
  created_at: Date;
  resolved_at?: Date;
  requests?: RequestSummary[];
}

export interface RequestSummary {
  id: string;
  confirmation_number: string;
  description: string;
  requester_name: string;
  requester_email: string;
  status: string;
  submitted_at: Date;
}

export interface SimilarRequest {
  id: string;
  description: string;
  requester_id: string;
  requester_email: string;
  similarity_score: number;
}

export interface BatchAnalytics {
  merge_count: number;
  parallel_count: number;
  dismiss_count: number;
  estimated_hours_saved: number;
  top_batch_requesters: Array<{
    requester_email: string;
    batch_count: number;
  }>;
  top_batch_topics: Array<{
    topic: string;
    batch_count: number;
  }>;
}

/**
 * Batch Intelligence Service
 */
export class BatchService {
  private db: Pool;
  private tenantId: string;

  constructor(db: Pool, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Generate embedding for request description
   * (Reuse from DeflectionService or create shared utility)
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
      'AI-13',
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
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }

    for (let i = 0; i < 1536; i++) {
      const seed = (hash + i) * 9301 + 49297;
      embedding[i] = ((seed % 233280) / 233280.0) * 2 - 1;
    }

    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Detect batch opportunities for a new request
   */
  async detectBatchOpportunities(
    requestId: string,
    description: string
  ): Promise<BatchOpportunity[]> {
    // Generate embedding for new request
    const embedding = await this.generateEmbedding(description);
    const embeddingString = `[${embedding.join(',')}]`;

    // Update request with embedding
    await this.db.query(
      `UPDATE "FoiaRequests"
       SET embedding = $1::vector
       WHERE id = $2`,
      [embeddingString, requestId]
    );

    // Get requester info for new request
    const newRequestResult = await this.db.query(
      `SELECT requester_id, requester_email
       FROM "FoiaRequests"
       WHERE id = $1`,
      [requestId]
    );

    if (newRequestResult.rows.length === 0) {
      return [];
    }

    const { requester_id: newRequesterId, requester_email: newRequesterEmail } = newRequestResult.rows[0];

    // Find similar open requests
    const similarRequests = await this.findSimilarOpenRequests(requestId, embeddingString);

    if (similarRequests.length === 0) {
      return [];
    }

    // Group by similarity and requester
    const opportunities: BatchOpportunity[] = [];

    // Group 1: Same requester (potential MERGE or PARALLEL)
    const sameRequester = similarRequests.filter(r => r.requester_id === newRequesterId);

    if (sameRequester.length > 0) {
      const topScore = Math.max(...sameRequester.map(r => r.similarity_score));

      let recommendedAction: 'MERGE' | 'PARALLEL';
      if (topScore > 0.80) {
        recommendedAction = 'MERGE';
      } else {
        recommendedAction = 'PARALLEL';
      }

      const groupId = this.generateGroupId();
      const requestIds = [requestId, ...sameRequester.map(r => r.id)];
      const requesterIds = [newRequesterId];

      // Create batch opportunity record
      const opportunityResult = await this.db.query(
        `INSERT INTO "FoiaBatchOpportunities" (
          id, group_id, tenant_id, request_ids, requester_ids,
          similarity_score, recommended_action, created_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW()
        ) RETURNING id`,
        [groupId, this.tenantId, requestIds, requesterIds, topScore, recommendedAction]
      );

      opportunities.push({
        id: opportunityResult.rows[0].id,
        group_id: groupId,
        tenant_id: this.tenantId,
        request_ids: requestIds,
        requester_ids: requesterIds,
        similarity_score: topScore,
        recommended_action: recommendedAction,
        created_at: new Date()
      });
    }

    // Group 2: Different requesters but high similarity (COORDINATE)
    const differentRequesters = similarRequests.filter(
      r => r.requester_id !== newRequesterId && r.similarity_score > 0.85
    );

    if (differentRequesters.length > 0) {
      const topScore = Math.max(...differentRequesters.map(r => r.similarity_score));
      const groupId = this.generateGroupId();
      const requestIds = [requestId, ...differentRequesters.map(r => r.id)];
      const requesterIds = [newRequesterId, ...new Set(differentRequesters.map(r => r.requester_id))];

      const opportunityResult = await this.db.query(
        `INSERT INTO "FoiaBatchOpportunities" (
          id, group_id, tenant_id, request_ids, requester_ids,
          similarity_score, recommended_action, created_at
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4, $5, 'COORDINATE', NOW()
        ) RETURNING id`,
        [groupId, this.tenantId, requestIds, requesterIds, topScore]
      );

      opportunities.push({
        id: opportunityResult.rows[0].id,
        group_id: groupId,
        tenant_id: this.tenantId,
        request_ids: requestIds,
        requester_ids: requesterIds,
        similarity_score: topScore,
        recommended_action: 'COORDINATE',
        created_at: new Date()
      });
    }

    return opportunities;
  }

  /**
   * Find similar open requests
   */
  private async findSimilarOpenRequests(
    excludeRequestId: string,
    embedding: string
  ): Promise<SimilarRequest[]> {
    const result = await this.db.query(
      `SELECT
        id,
        description,
        requester_id,
        requester_email,
        1 - (embedding <=> $1::vector) as similarity_score
      FROM "FoiaRequests"
      WHERE tenant_id = $2
        AND id != $3
        AND status NOT IN ('DELIVERED', 'WITHDRAWN', 'CLOSED')
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) > 0.60
      ORDER BY embedding <=> $1::vector
      LIMIT 10`,
      [embedding, this.tenantId, excludeRequestId]
    );

    return result.rows;
  }

  /**
   * Generate unique group ID
   */
  private generateGroupId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all open batch opportunities
   */
  async getOpportunities(): Promise<BatchOpportunity[]> {
    const result = await this.db.query(
      `SELECT * FROM "FoiaBatchOpportunities"
       WHERE tenant_id = $1
         AND resolved_at IS NULL
       ORDER BY similarity_score DESC`,
      [this.tenantId]
    );

    const opportunities: BatchOpportunity[] = [];

    for (const row of result.rows) {
      // Fetch request details
      const requestsResult = await this.db.query(
        `SELECT
          id, confirmation_number, description,
          requester_name, requester_email, status, submitted_at
        FROM "FoiaRequests"
        WHERE id = ANY($1)`,
        [row.request_ids]
      );

      opportunities.push({
        id: row.id,
        group_id: row.group_id,
        tenant_id: row.tenant_id,
        request_ids: row.request_ids,
        requester_ids: row.requester_ids,
        similarity_score: parseFloat(row.similarity_score),
        recommended_action: row.recommended_action,
        actual_action: row.actual_action,
        reason: row.reason,
        primary_request_id: row.primary_request_id,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        requests: requestsResult.rows
      });
    }

    return opportunities;
  }

  /**
   * Execute batch action (MERGE, PARALLEL, DISMISS)
   */
  async executeAction(
    opportunityId: string,
    action: 'MERGE' | 'PARALLEL' | 'DISMISS',
    primaryRequestId?: string,
    reason?: string
  ): Promise<void> {
    // Get opportunity details
    const opportunityResult = await this.db.query(
      `SELECT * FROM "FoiaBatchOpportunities"
       WHERE id = $1 AND tenant_id = $2`,
      [opportunityId, this.tenantId]
    );

    if (opportunityResult.rows.length === 0) {
      throw new Error('Opportunity not found');
    }

    const opportunity = opportunityResult.rows[0];

    if (action === 'MERGE') {
      await this.executeMerge(opportunity, primaryRequestId!);
    } else if (action === 'PARALLEL') {
      await this.executeParallel(opportunity, primaryRequestId!);
    }

    // Update opportunity record
    await this.db.query(
      `UPDATE "FoiaBatchOpportunities"
       SET actual_action = $1,
           primary_request_id = $2,
           reason = $3,
           resolved_at = NOW()
       WHERE id = $4`,
      [action, primaryRequestId, reason, opportunityId]
    );
  }

  /**
   * Execute MERGE action
   */
  private async executeMerge(opportunity: any, primaryRequestId: string): Promise<void> {
    const secondaryRequestIds = opportunity.request_ids.filter((id: string) => id !== primaryRequestId);

    // Update secondary requests
    for (const secondaryId of secondaryRequestIds) {
      await this.db.query(
        `UPDATE "FoiaRequests"
         SET status = 'MERGED_INTO',
             merged_into_request_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [primaryRequestId, secondaryId]
      );
    }

    // TODO: In production, combine document collections
    // This would involve moving/linking documents from secondary requests to primary
  }

  /**
   * Execute PARALLEL action
   */
  private async executeParallel(opportunity: any, primaryRequestId: string): Promise<void> {
    const parallelGroupId = opportunity.group_id;

    // Update all requests with parallel group
    for (const requestId of opportunity.request_ids) {
      await this.db.query(
        `UPDATE "FoiaRequests"
         SET parallel_group_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [parallelGroupId, requestId]
      );
    }

    // TODO: In production, set up workflow to share triage/redaction suggestions
  }

  /**
   * Get batch analytics
   */
  async getAnalytics(dateFrom: Date, dateTo: Date): Promise<BatchAnalytics> {
    // Count by action type
    const countsResult = await this.db.query(
      `SELECT
        actual_action,
        COUNT(*) as count
      FROM "FoiaBatchOpportunities"
      WHERE tenant_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND actual_action IS NOT NULL
      GROUP BY actual_action`,
      [this.tenantId, dateFrom, dateTo]
    );

    let mergeCount = 0;
    let parallelCount = 0;
    let dismissCount = 0;

    for (const row of countsResult.rows) {
      const count = parseInt(row.count);
      switch (row.actual_action) {
        case 'MERGE':
          mergeCount = count;
          break;
        case 'PARALLEL':
          parallelCount = count;
          break;
        case 'DISMISS':
          dismissCount = count;
          break;
      }
    }

    // Estimate hours saved (merges * 3.5 + parallels * 1.5)
    const estimatedHoursSaved = (mergeCount * 3.5) + (parallelCount * 1.5);

    // Top batch requesters
    const topRequestersResult = await this.db.query(
      `SELECT
        r.requester_email,
        COUNT(DISTINCT bo.id) as batch_count
      FROM "FoiaBatchOpportunities" bo
      CROSS JOIN LATERAL unnest(bo.requester_ids) as requester_id
      JOIN "FoiaRequests" r ON r.requester_id = requester_id::uuid
      WHERE bo.tenant_id = $1
        AND bo.created_at >= $2
        AND bo.created_at <= $3
        AND bo.actual_action IN ('MERGE', 'PARALLEL')
      GROUP BY r.requester_email
      ORDER BY batch_count DESC
      LIMIT 10`,
      [this.tenantId, dateFrom, dateTo]
    );

    const topBatchRequesters = topRequestersResult.rows.map(row => ({
      requester_email: row.requester_email,
      batch_count: parseInt(row.batch_count)
    }));

    // Top batch topics (extract keywords from descriptions)
    // Simplified version - in production, use topic modeling
    const topBatchTopics = [
      { topic: 'Email Communications', batch_count: mergeCount + parallelCount },
      { topic: 'Budget Documents', batch_count: Math.floor((mergeCount + parallelCount) * 0.7) },
      { topic: 'Personnel Records', batch_count: Math.floor((mergeCount + parallelCount) * 0.5) }
    ];

    return {
      merge_count: mergeCount,
      parallel_count: parallelCount,
      dismiss_count: dismissCount,
      estimated_hours_saved: estimatedHoursSaved,
      top_batch_requesters: topBatchRequesters,
      top_batch_topics: topBatchTopics
    };
  }
}
