/**
 * Govli AI FOIA Module - Smart Deflection Service
 * AI-12: Semantic search to deflect duplicate requests
 */

import { getSharedAIClient } from '@govli/foia-shared';
import { Pool } from 'pg';

export interface DeflectionMatch {
  id: string;
  source: 'reading_room' | 'prior_response' | 'faq';
  title: string;
  description: string;
  url?: string;
  similarity_score: number;
  metadata?: {
    confirmation_number?: string;
    release_date?: string;
    document_count?: number;
  };
}

export interface DeflectionResult {
  matches: DeflectionMatch[];
  has_relevant_match: boolean;
  deflection_id: string;
}

export interface DeflectionAnalytics {
  total_searches: number;
  total_deflections: number;
  deflection_rate: number;
  estimated_hours_saved: number;
  top_deflected_records: Array<{
    title: string;
    deflection_count: number;
  }>;
  daily_trend: Array<{
    date: string;
    searches: number;
    deflections: number;
  }>;
}

/**
 * Smart Deflection Service
 */
export class DeflectionService {
  private db: Pool;
  private tenantId: string;
  private similarityThreshold = 0.75;

  constructor(db: Pool, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Generate embedding for search text using Claude Haiku
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const aiClient = getSharedAIClient();

    // Use Haiku to create a semantic summary for embedding
    const summaryPrompt = `Summarize this FOIA request in 2 sentences for semantic matching: ${text}`;

    const result = await aiClient.callWithAudit(
      {
        prompt: summaryPrompt,
        maxTokens: 100,
        temperature: 0.1,
        systemPrompt: 'You are a FOIA request analyzer. Create concise, semantic summaries.'
      },
      'AI-12', // Feature ID
      this.tenantId
    );

    const summary = result.content.trim();

    // Generate embedding from summary
    // Note: In production, you would use a proper embedding model
    // For this implementation, we'll use a mock embedding based on text hash
    return this.mockEmbedding(summary);
  }

  /**
   * Mock embedding generation (replace with actual embedding model in production)
   * In production, use OpenAI embeddings, Voyage AI, or similar
   */
  private mockEmbedding(text: string): number[] {
    // Generate a deterministic 1536-dimensional vector based on text
    const embedding: number[] = new Array(1536);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }

    // Use hash to seed pseudo-random values
    for (let i = 0; i < 1536; i++) {
      const seed = (hash + i) * 9301 + 49297;
      embedding[i] = ((seed % 233280) / 233280.0) * 2 - 1;
    }

    // Normalize vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Search for similar records across reading room, responses, and FAQs
   */
  async searchSimilarRecords(
    partialDescription: string,
    agencyId?: string
  ): Promise<DeflectionResult> {
    // Generate embedding for search query
    const queryEmbedding = await this.generateEmbedding(partialDescription);
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    // Create deflection log entry
    const deflectionLogResult = await this.db.query(
      `INSERT INTO "FoiaDeflectionLog" (
        id, tenant_id, search_text, created_at
      ) VALUES (uuid_generate_v4(), $1, $2, NOW())
      RETURNING id`,
      [this.tenantId, partialDescription]
    );

    const deflectionId = deflectionLogResult.rows[0].id;

    const matches: DeflectionMatch[] = [];

    // Search 1: Reading Room
    try {
      const readingRoomResults = await this.db.query(
        `SELECT
          id,
          title,
          description,
          url,
          1 - (embedding <=> $1::vector) as similarity
        FROM "FoiaReadingRoom"
        WHERE tenant_id = $2
          ${agencyId ? 'AND agency_id = $3' : ''}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 5`,
        agencyId ? [embeddingString, this.tenantId, agencyId] : [embeddingString, this.tenantId]
      );

      for (const row of readingRoomResults.rows) {
        if (row.similarity >= this.similarityThreshold) {
          matches.push({
            id: row.id,
            source: 'reading_room',
            title: row.title,
            description: row.description,
            url: row.url,
            similarity_score: row.similarity
          });
        }
      }
    } catch (error) {
      console.error('Error searching reading room:', error);
    }

    // Search 2: Prior Responses
    try {
      const responseResults = await this.db.query(
        `SELECT
          r.id,
          r.confirmation_number,
          r.description,
          r.response_letter,
          1 - (r.embedding <=> $1::vector) as similarity,
          COUNT(d.id) as document_count
        FROM "FoiaRequests" r
        LEFT JOIN "FoiaDocuments" d ON d.request_id = r.id
        WHERE r.tenant_id = $2
          AND r.delivery_status = 'DELIVERED'
          AND r.release_type IN ('FULL_GRANT', 'PARTIAL_GRANT')
          ${agencyId ? 'AND r.agency_id = $3' : ''}
          AND r.embedding IS NOT NULL
        GROUP BY r.id, r.confirmation_number, r.description, r.response_letter, r.embedding
        ORDER BY r.embedding <=> $1::vector
        LIMIT 5`,
        agencyId ? [embeddingString, this.tenantId, agencyId] : [embeddingString, this.tenantId]
      );

      for (const row of responseResults.rows) {
        if (row.similarity >= this.similarityThreshold) {
          matches.push({
            id: row.id,
            source: 'prior_response',
            title: `FOIA Request ${row.confirmation_number}`,
            description: row.description || row.response_letter?.substring(0, 200) || '',
            similarity_score: row.similarity,
            metadata: {
              confirmation_number: row.confirmation_number,
              document_count: parseInt(row.document_count)
            }
          });
        }
      }
    } catch (error) {
      console.error('Error searching prior responses:', error);
    }

    // Search 3: FAQ Entries
    try {
      const faqResults = await this.db.query(
        `SELECT
          id,
          question,
          answer,
          1 - (embedding <=> $1::vector) as similarity
        FROM "FoiaFaqEntries"
        WHERE tenant_id = $2
          ${agencyId ? 'AND agency_id = $3' : ''}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 5`,
        agencyId ? [embeddingString, this.tenantId, agencyId] : [embeddingString, this.tenantId]
      );

      for (const row of faqResults.rows) {
        if (row.similarity >= this.similarityThreshold) {
          matches.push({
            id: row.id,
            source: 'faq',
            title: row.question,
            description: row.answer,
            similarity_score: row.similarity
          });
        }
      }
    } catch (error) {
      console.error('Error searching FAQs:', error);
    }

    // Sort all matches by similarity score
    matches.sort((a, b) => b.similarity_score - a.similarity_score);

    // Take top 5 overall
    const topMatches = matches.slice(0, 5);

    // Update deflection log with results
    await this.db.query(
      `UPDATE "FoiaDeflectionLog"
       SET match_count = $1,
           top_score = $2
       WHERE id = $3`,
      [topMatches.length, topMatches[0]?.similarity_score || 0, deflectionId]
    );

    return {
      matches: topMatches,
      has_relevant_match: topMatches.length > 0,
      deflection_id: deflectionId
    };
  }

  /**
   * Log outcome of deflection
   */
  async logOutcome(
    deflectionId: string,
    outcome: 'downloaded' | 'dismissed' | 'submitted_anyway'
  ): Promise<void> {
    await this.db.query(
      `UPDATE "FoiaDeflectionLog"
       SET outcome = $1,
           outcome_recorded_at = NOW()
       WHERE id = $2`,
      [outcome, deflectionId]
    );
  }

  /**
   * Get deflection analytics
   */
  async getAnalytics(
    dateFrom: Date,
    dateTo: Date
  ): Promise<DeflectionAnalytics> {
    // Total searches
    const searchesResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaDeflectionLog"
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [this.tenantId, dateFrom, dateTo]
    );

    const totalSearches = parseInt(searchesResult.rows[0]?.count || '0');

    // Total deflections (downloaded)
    const deflectionsResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaDeflectionLog"
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3
         AND outcome = 'downloaded'`,
      [this.tenantId, dateFrom, dateTo]
    );

    const totalDeflections = parseInt(deflectionsResult.rows[0]?.count || '0');

    // Deflection rate
    const deflectionRate = totalSearches > 0 ? totalDeflections / totalSearches : 0;

    // Estimated hours saved (assume 3.5 hours per deflected request)
    const estimatedHoursSaved = totalDeflections * 3.5;

    // Top deflected records
    const topRecordsResult = await this.db.query(
      `SELECT
         rr.title,
         COUNT(dl.id) as deflection_count
       FROM "FoiaDeflectionLog" dl
       JOIN "FoiaReadingRoom" rr ON rr.id::text = dl.matched_record_id
       WHERE dl.tenant_id = $1
         AND dl.created_at >= $2
         AND dl.created_at <= $3
         AND dl.outcome = 'downloaded'
       GROUP BY rr.title
       ORDER BY deflection_count DESC
       LIMIT 10`,
      [this.tenantId, dateFrom, dateTo]
    );

    const topDeflectedRecords = topRecordsResult.rows.map(row => ({
      title: row.title,
      deflection_count: parseInt(row.deflection_count)
    }));

    // Daily trend
    const trendResult = await this.db.query(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) as searches,
         COUNT(*) FILTER (WHERE outcome = 'downloaded') as deflections
       FROM "FoiaDeflectionLog"
       WHERE tenant_id = $1
         AND created_at >= $2
         AND created_at <= $3
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [this.tenantId, dateFrom, dateTo]
    );

    const dailyTrend = trendResult.rows.map(row => ({
      date: row.date,
      searches: parseInt(row.searches),
      deflections: parseInt(row.deflections)
    }));

    return {
      total_searches: totalSearches,
      total_deflections: totalDeflections,
      deflection_rate: deflectionRate,
      estimated_hours_saved: estimatedHoursSaved,
      top_deflected_records: topDeflectedRecords,
      daily_trend: dailyTrend
    };
  }

  /**
   * Refresh embeddings for new records
   */
  async refreshEmbeddings(): Promise<{
    reading_room_updated: number;
    responses_updated: number;
    faqs_updated: number;
  }> {
    let readingRoomUpdated = 0;
    let responsesUpdated = 0;
    let faqsUpdated = 0;

    // Update reading room entries without embeddings
    const readingRoomRecords = await this.db.query(
      `SELECT id, title, description
       FROM "FoiaReadingRoom"
       WHERE tenant_id = $1
         AND (embedding IS NULL OR updated_at > NOW() - INTERVAL '1 day')
       LIMIT 100`,
      [this.tenantId]
    );

    for (const record of readingRoomRecords.rows) {
      const text = `${record.title} ${record.description}`;
      const embedding = await this.generateEmbedding(text);
      const embeddingString = `[${embedding.join(',')}]`;

      await this.db.query(
        `UPDATE "FoiaReadingRoom"
         SET embedding = $1::vector
         WHERE id = $2`,
        [embeddingString, record.id]
      );

      readingRoomUpdated++;
    }

    // Update responses without embeddings
    const responseRecords = await this.db.query(
      `SELECT id, description, response_letter
       FROM "FoiaRequests"
       WHERE tenant_id = $1
         AND delivery_status = 'DELIVERED'
         AND release_type IN ('FULL_GRANT', 'PARTIAL_GRANT')
         AND (embedding IS NULL OR updated_at > NOW() - INTERVAL '1 day')
       LIMIT 100`,
      [this.tenantId]
    );

    for (const record of responseRecords.rows) {
      const text = record.description || record.response_letter || '';
      const embedding = await this.generateEmbedding(text);
      const embeddingString = `[${embedding.join(',')}]`;

      await this.db.query(
        `UPDATE "FoiaRequests"
         SET embedding = $1::vector
         WHERE id = $2`,
        [embeddingString, record.id]
      );

      responsesUpdated++;
    }

    // Update FAQs without embeddings
    const faqRecords = await this.db.query(
      `SELECT id, question, answer
       FROM "FoiaFaqEntries"
       WHERE tenant_id = $1
         AND (embedding IS NULL OR updated_at > NOW() - INTERVAL '1 day')
       LIMIT 100`,
      [this.tenantId]
    );

    for (const record of faqRecords.rows) {
      const text = `${record.question} ${record.answer}`;
      const embedding = await this.generateEmbedding(text);
      const embeddingString = `[${embedding.join(',')}]`;

      await this.db.query(
        `UPDATE "FoiaFaqEntries"
         SET embedding = $1::vector
         WHERE id = $2`,
        [embeddingString, record.id]
      );

      faqsUpdated++;
    }

    return {
      reading_room_updated: readingRoomUpdated,
      responses_updated: responsesUpdated,
      faqs_updated: faqsUpdated
    };
  }
}
