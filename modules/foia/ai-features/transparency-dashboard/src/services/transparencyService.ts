/**
 * AI-16: Public Transparency Dashboard & Score Service
 *
 * Calculates transparency scores for agencies based on performance metrics
 * and provides public-facing dashboard data
 */

import { Pool } from 'pg';

interface TransparencyComponents {
  response_time: number; // 0-25 points
  on_time_rate: number; // 0-25 points
  proactive_disclosure: number; // 0-20 points
  denial_rate: number; // 0-15 points
  appeal_reversal: number; // 0-15 points
}

interface TransparencyScore {
  tenant_id: string;
  score: number; // 0-100
  components: TransparencyComponents;
  peer_percentile: number; // 0-100
  calculated_at: Date;
}

interface MonthlyStats {
  month: string;
  requests_received: number;
  median_response_days: number;
  on_time_pct: number;
  denials: number;
  proactive_disclosures: number;
}

interface TopExemption {
  code: string;
  count: number;
  description: string;
}

interface PublicDashboardData {
  agency_name: string;
  score: number;
  components: TransparencyComponents;
  peer_percentile: number;
  monthly_stats: MonthlyStats[];
  top_exemptions: TopExemption[];
  reading_room_count: number;
  last_updated: Date;
}

/**
 * TransparencyService handles transparency score calculation and public dashboards
 */
export class TransparencyService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Calculate transparency score for a tenant
   */
  async calculateScore(tenantId: string): Promise<TransparencyScore> {
    // Query last 12 months of requests and responses
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get request data
    const requestsResult = await this.db.query(
      `SELECT
        r.id,
        r.status,
        r.submitted_at,
        r.closed_at,
        r.deadline,
        EXTRACT(DAY FROM (r.closed_at - r.submitted_at)) as response_days
      FROM "FoiaRequests" r
      WHERE r.tenant_id = $1
        AND r.submitted_at >= $2
        AND r.status IN ('CLOSED', 'DELIVERED')`,
      [tenantId, twelveMonthsAgo]
    );

    const requests = requestsResult.rows;

    if (requests.length === 0) {
      // No data - return minimum score
      return {
        tenant_id: tenantId,
        score: 0,
        components: {
          response_time: 0,
          on_time_rate: 0,
          proactive_disclosure: 0,
          denial_rate: 0,
          appeal_reversal: 0
        },
        peer_percentile: 0,
        calculated_at: new Date()
      };
    }

    // Calculate components
    const components: TransparencyComponents = {
      response_time: await this.calculateResponseTimeScore(requests),
      on_time_rate: await this.calculateOnTimeRateScore(requests),
      proactive_disclosure: await this.calculateProactiveDisclosureScore(tenantId, twelveMonthsAgo),
      denial_rate: await this.calculateDenialRateScore(tenantId, twelveMonthsAgo),
      appeal_reversal: await this.calculateAppealReversalScore(tenantId, twelveMonthsAgo)
    };

    const totalScore = Object.values(components).reduce((sum, score) => sum + score, 0);

    // Calculate peer percentile
    const peerPercentile = await this.calculatePeerPercentile(tenantId, totalScore);

    return {
      tenant_id: tenantId,
      score: Math.round(totalScore),
      components,
      peer_percentile: peerPercentile,
      calculated_at: new Date()
    };
  }

  /**
   * Response Time Score (0-25 points)
   * Based on median days to respond
   */
  private async calculateResponseTimeScore(requests: any[]): Promise<number> {
    const responseDays = requests
      .filter(r => r.response_days !== null)
      .map(r => parseFloat(r.response_days))
      .sort((a, b) => a - b);

    if (responseDays.length === 0) return 0;

    const median = responseDays[Math.floor(responseDays.length / 2)];

    if (median < 5) return 25;
    if (median < 10) return 20;
    if (median < 15) return 15;
    if (median < 20) return 10;
    if (median < 30) return 5;
    return 0;
  }

  /**
   * On-Time Rate Score (0-25 points)
   * Based on % responses within statutory deadline
   */
  private async calculateOnTimeRateScore(requests: any[]): Promise<number> {
    const onTimeCount = requests.filter(r => {
      if (!r.closed_at || !r.deadline) return false;
      return new Date(r.closed_at) <= new Date(r.deadline);
    }).length;

    const onTimeRate = (onTimeCount / requests.length) * 100;

    if (onTimeRate > 95) return 25;
    if (onTimeRate > 85) return 20;
    if (onTimeRate > 75) return 15;
    if (onTimeRate > 65) return 10;
    if (onTimeRate > 50) return 5;
    return 0;
  }

  /**
   * Proactive Disclosure Score (0-20 points)
   * Based on reading room entries added / total requests
   */
  private async calculateProactiveDisclosureScore(tenantId: string, since: Date): Promise<number> {
    const readingRoomResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaReadingRoom"
       WHERE tenant_id = $1 AND created_at >= $2`,
      [tenantId, since]
    );

    const requestsResult = await this.db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaRequests"
       WHERE tenant_id = $1 AND submitted_at >= $2`,
      [tenantId, since]
    );

    const readingRoomCount = parseInt(readingRoomResult.rows[0].count);
    const requestsCount = parseInt(requestsResult.rows[0].count);

    if (requestsCount === 0) return 0;

    const proactiveRate = (readingRoomCount / requestsCount) * 100;

    if (proactiveRate > 20) return 20;
    if (proactiveRate > 10) return 15;
    if (proactiveRate > 5) return 10;
    if (proactiveRate > 2) return 5;
    return 0;
  }

  /**
   * Denial Rate Score (0-15 points)
   * Inverse of full denial percentage (lower denials = higher score)
   */
  private async calculateDenialRateScore(tenantId: string, since: Date): Promise<number> {
    const result = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE response_type = 'DENIED') as denials,
        COUNT(*) as total
       FROM "FoiaRequests"
       WHERE tenant_id = $1
         AND submitted_at >= $2
         AND status IN ('CLOSED', 'DELIVERED')`,
      [tenantId, since]
    );

    const denials = parseInt(result.rows[0].denials || 0);
    const total = parseInt(result.rows[0].total);

    if (total === 0) return 0;

    const denialRate = (denials / total) * 100;

    if (denialRate < 5) return 15;
    if (denialRate < 10) return 12;
    if (denialRate < 15) return 9;
    if (denialRate < 25) return 6;
    if (denialRate < 40) return 3;
    return 0;
  }

  /**
   * Appeal Reversal Score (0-15 points)
   * Inverse of appeal reversal percentage (lower reversals = higher score)
   */
  private async calculateAppealReversalScore(tenantId: string, since: Date): Promise<number> {
    const result = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE appeal_outcome = 'REVERSED') as reversed,
        COUNT(*) as total
       FROM "FoiaAppeals"
       WHERE tenant_id = $1
         AND submitted_at >= $2
         AND appeal_outcome IS NOT NULL`,
      [tenantId, since]
    );

    const reversed = parseInt(result.rows[0].reversed || 0);
    const total = parseInt(result.rows[0].total);

    if (total === 0) return 15; // No appeals = perfect score

    const reversalRate = (reversed / total) * 100;

    if (reversalRate < 5) return 15;
    if (reversalRate < 10) return 12;
    if (reversalRate < 15) return 9;
    if (reversalRate < 25) return 6;
    if (reversalRate < 40) return 3;
    return 0;
  }

  /**
   * Calculate peer percentile
   * Compare vs tenants in same state + size tier
   */
  private async calculatePeerPercentile(tenantId: string, score: number): Promise<number> {
    // Get tenant info
    const tenantResult = await this.db.query(
      `SELECT state, size_tier FROM "FoiaTenants" WHERE id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) return 50; // Default to 50th percentile

    const { state, size_tier } = tenantResult.rows[0];

    // Get peer scores
    const peersResult = await this.db.query(
      `SELECT ts.score
       FROM "FoiaTransparencyScores" ts
       JOIN "FoiaTenants" t ON ts.tenant_id = t.id
       WHERE t.state = $1
         AND t.size_tier = $2
         AND ts.id IN (
           SELECT id FROM "FoiaTransparencyScores"
           WHERE tenant_id = ts.tenant_id
           ORDER BY calculated_at DESC
           LIMIT 1
         )`,
      [state, size_tier]
    );

    const peerScores = peersResult.rows.map(r => r.score);

    if (peerScores.length === 0) return 50;

    const lowerScores = peerScores.filter(s => s < score).length;
    const percentile = (lowerScores / peerScores.length) * 100;

    return Math.round(percentile);
  }

  /**
   * Store transparency score
   */
  async storeScore(score: TransparencyScore): Promise<void> {
    await this.db.query(
      `INSERT INTO "FoiaTransparencyScores"
        (id, tenant_id, score, components, peer_percentile, calculated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [
        score.tenant_id,
        score.score,
        JSON.stringify(score.components),
        score.peer_percentile,
        score.calculated_at
      ]
    );

    console.log('[TransparencyService] Emitting foia.transparency.score_updated', {
      tenant_id: score.tenant_id,
      score: score.score
    });
  }

  /**
   * Get public dashboard data
   */
  async getPublicDashboard(agencySlug: string): Promise<PublicDashboardData | null> {
    // Get tenant by slug
    const tenantResult = await this.db.query(
      `SELECT id, name, transparency_public FROM "FoiaTenants" WHERE slug = $1`,
      [agencySlug]
    );

    if (tenantResult.rows.length === 0) return null;

    const tenant = tenantResult.rows[0];

    // Check if transparency is public
    if (!tenant.transparency_public) return null;

    // Get latest score
    const scoreResult = await this.db.query(
      `SELECT score, components, peer_percentile, calculated_at
       FROM "FoiaTransparencyScores"
       WHERE tenant_id = $1
       ORDER BY calculated_at DESC
       LIMIT 1`,
      [tenant.id]
    );

    if (scoreResult.rows.length === 0) return null;

    const scoreData = scoreResult.rows[0];

    // Get monthly stats (last 12 months)
    const monthlyStats = await this.getMonthlyStats(tenant.id);

    // Get top exemptions
    const topExemptions = await this.getTopExemptions(tenant.id);

    // Get reading room count
    const readingRoomResult = await this.db.query(
      `SELECT COUNT(*) as count FROM "FoiaReadingRoom" WHERE tenant_id = $1`,
      [tenant.id]
    );

    return {
      agency_name: tenant.name,
      score: scoreData.score,
      components: scoreData.components,
      peer_percentile: scoreData.peer_percentile,
      monthly_stats: monthlyStats,
      top_exemptions: topExemptions,
      reading_room_count: parseInt(readingRoomResult.rows[0].count),
      last_updated: scoreData.calculated_at
    };
  }

  /**
   * Get monthly statistics
   */
  private async getMonthlyStats(tenantId: string): Promise<MonthlyStats[]> {
    const result = await this.db.query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', submitted_at), 'YYYY-MM') as month,
        COUNT(*) as requests_received,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM (closed_at - submitted_at))) as median_response_days,
        ROUND(100.0 * COUNT(*) FILTER (WHERE closed_at <= deadline) / COUNT(*), 1) as on_time_pct,
        COUNT(*) FILTER (WHERE response_type = 'DENIED') as denials,
        0 as proactive_disclosures
      FROM "FoiaRequests"
      WHERE tenant_id = $1
        AND submitted_at >= NOW() - INTERVAL '12 months'
        AND status IN ('CLOSED', 'DELIVERED')
      GROUP BY DATE_TRUNC('month', submitted_at)
      ORDER BY month DESC`,
      [tenantId]
    );

    return result.rows.map(row => ({
      month: row.month,
      requests_received: parseInt(row.requests_received),
      median_response_days: parseFloat(row.median_response_days || 0),
      on_time_pct: parseFloat(row.on_time_pct || 0),
      denials: parseInt(row.denials || 0),
      proactive_disclosures: parseInt(row.proactive_disclosures || 0)
    }));
  }

  /**
   * Get top exemptions used
   */
  private async getTopExemptions(tenantId: string): Promise<TopExemption[]> {
    const result = await this.db.query(
      `SELECT
        exemption_code as code,
        COUNT(*) as count,
        '' as description
      FROM "FoiaExemptionCitations"
      WHERE request_id IN (
        SELECT id FROM "FoiaRequests"
        WHERE tenant_id = $1
          AND submitted_at >= NOW() - INTERVAL '12 months'
      )
      GROUP BY exemption_code
      ORDER BY count DESC
      LIMIT 10`,
      [tenantId]
    );

    return result.rows.map(row => ({
      code: row.code,
      count: parseInt(row.count),
      description: this.getExemptionDescription(row.code)
    }));
  }

  /**
   * Get exemption description (hardcoded for common codes)
   */
  private getExemptionDescription(code: string): string {
    const descriptions: Record<string, string> = {
      '§ 552.101': 'Information confidential by law',
      '§ 552.108': 'Certain law enforcement records',
      '§ 552.110': 'Trade secrets',
      '§ 552.111': 'Examination information',
      '§ 552.117': 'Litigation or settlement negotiations'
    };
    return descriptions[code] || 'Exemption';
  }

  /**
   * Toggle transparency public visibility
   */
  async setPublicVisibility(tenantId: string, isPublic: boolean): Promise<void> {
    await this.db.query(
      `UPDATE "FoiaTenants"
       SET transparency_public = $1, updated_at = NOW()
       WHERE id = $2`,
      [isPublic, tenantId]
    );
  }
}
