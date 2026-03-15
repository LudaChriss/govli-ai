/**
 * AI-16: Public Transparency Dashboard & Score - API Handlers
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { TransparencyService } from './services/transparencyService';
import { calculateAllScores } from './jobs/scoreCalculationJob';
import { AuthenticatedRequest } from './types';

/**
 * POST /ai/transparency/calculate
 * Manually trigger transparency score calculation
 * Auth: foia_supervisor+
 */
export async function calculateScores(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { tenant_id } = req.body;

  try {
    if (tenant_id) {
      // Calculate for single tenant
      const transparencyService = new TransparencyService(db);
      const score = await transparencyService.calculateScore(tenant_id);
      await transparencyService.storeScore(score);

      res.json({
        success: true,
        data: {
          tenant_id,
          score: score.score,
          components: score.components,
          peer_percentile: score.peer_percentile,
          calculated_at: score.calculated_at
        }
      });
    } else {
      // Calculate for all enabled tenants
      await calculateAllScores(db);

      res.json({
        success: true,
        data: {
          message: 'Transparency scores calculated for all enabled tenants'
        }
      });
    }
  } catch (error) {
    console.error('[TransparencyHandlers] Error calculating scores:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate transparency scores'
    });
  }
}

/**
 * GET /public/transparency/:agencySlug
 * Get public transparency dashboard data
 * PUBLIC endpoint (no auth required)
 */
export async function getPublicDashboard(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { agencySlug } = req.params;

  try {
    const transparencyService = new TransparencyService(db);
    const dashboard = await transparencyService.getPublicDashboard(agencySlug);

    if (!dashboard) {
      res.status(404).json({
        success: false,
        error: 'Transparency dashboard not found or not public'
      });
      return;
    }

    // Set CORS headers for public access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('[TransparencyHandlers] Error fetching public dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transparency dashboard'
    });
  }
}

/**
 * GET /public/transparency/:agencySlug/embed
 * Get embeddable widget HTML for transparency dashboard
 * PUBLIC endpoint (no auth required)
 */
export async function getEmbedWidget(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { agencySlug } = req.params;

  try {
    const transparencyService = new TransparencyService(db);
    const dashboard = await transparencyService.getPublicDashboard(agencySlug);

    if (!dashboard) {
      res.status(404).send('<html><body><p>Transparency dashboard not found</p></body></html>');
      return;
    }

    // Generate embeddable HTML widget
    const widgetHTML = generateEmbedWidget(dashboard);

    // Set CORS headers for iframe embedding
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    res.send(widgetHTML);
  } catch (error) {
    console.error('[TransparencyHandlers] Error generating embed widget:', error);
    res.status(500).send('<html><body><p>Error loading transparency dashboard</p></body></html>');
  }
}

/**
 * GET /api/v1/foia/transparency/admin
 * Get admin transparency dashboard with peer comparison
 * Auth: foia_supervisor+
 */
export async function getAdminDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
    return;
  }

  try {
    const transparencyService = new TransparencyService(db);

    // Get own latest score
    const ownScoreResult = await db.query(
      `SELECT score, components, peer_percentile, calculated_at
       FROM "FoiaTransparencyScores"
       WHERE tenant_id = $1
       ORDER BY calculated_at DESC
       LIMIT 1`,
      [tenantId]
    );

    if (ownScoreResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'No transparency score found. Run calculation first.'
      });
      return;
    }

    const ownScore = ownScoreResult.rows[0];

    // Get tenant info for peer comparison
    const tenantResult = await db.query(
      `SELECT name, state, size_tier FROM "FoiaTenants" WHERE id = $1`,
      [tenantId]
    );

    const tenant = tenantResult.rows[0];

    // Get peer scores (same state + size tier)
    const peerScoresResult = await db.query(
      `SELECT
        t.name,
        ts.score,
        ts.peer_percentile,
        ts.calculated_at
       FROM "FoiaTransparencyScores" ts
       JOIN "FoiaTenants" t ON ts.tenant_id = t.id
       WHERE t.state = $1
         AND t.size_tier = $2
         AND ts.id IN (
           SELECT id FROM "FoiaTransparencyScores"
           WHERE tenant_id = ts.tenant_id
           ORDER BY calculated_at DESC
           LIMIT 1
         )
       ORDER BY ts.score DESC
       LIMIT 20`,
      [tenant.state, tenant.size_tier]
    );

    // Get state average
    const stateAvgResult = await db.query(
      `SELECT AVG(ts.score) as avg_score
       FROM "FoiaTransparencyScores" ts
       JOIN "FoiaTenants" t ON ts.tenant_id = t.id
       WHERE t.state = $1
         AND ts.id IN (
           SELECT id FROM "FoiaTransparencyScores"
           WHERE tenant_id = ts.tenant_id
           ORDER BY calculated_at DESC
           LIMIT 1
         )`,
      [tenant.state]
    );

    const stateAverage = parseFloat(stateAvgResult.rows[0].avg_score || 0);

    // Get national average
    const nationalAvgResult = await db.query(
      `SELECT AVG(score) as avg_score
       FROM (
         SELECT DISTINCT ON (tenant_id) tenant_id, score
         FROM "FoiaTransparencyScores"
         ORDER BY tenant_id, calculated_at DESC
       ) latest_scores`
    );

    const nationalAverage = parseFloat(nationalAvgResult.rows[0].avg_score || 0);

    res.json({
      success: true,
      data: {
        own_score: {
          score: ownScore.score,
          components: ownScore.components,
          peer_percentile: ownScore.peer_percentile,
          calculated_at: ownScore.calculated_at
        },
        peer_comparison: {
          state: tenant.state,
          size_tier: tenant.size_tier,
          state_average: Math.round(stateAverage),
          national_average: Math.round(nationalAverage),
          peer_scores: peerScoresResult.rows.map(row => ({
            agency_name: row.name,
            score: row.score,
            peer_percentile: row.peer_percentile
          }))
        }
      }
    });
  } catch (error) {
    console.error('[TransparencyHandlers] Error fetching admin dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin dashboard'
    });
  }
}

/**
 * PUT /api/v1/foia/transparency/settings
 * Update transparency dashboard settings
 * Auth: foia_supervisor+
 */
export async function updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = req.user?.tenant_id;
  const { transparency_dashboard_enabled, transparency_public } = req.body;

  if (!tenantId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
    return;
  }

  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (typeof transparency_dashboard_enabled === 'boolean') {
      updates.push(`transparency_dashboard_enabled = $${paramIndex++}`);
      values.push(transparency_dashboard_enabled);
    }

    if (typeof transparency_public === 'boolean') {
      updates.push(`transparency_public = $${paramIndex++}`);
      values.push(transparency_public);
    }

    if (updates.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid settings provided'
      });
      return;
    }

    updates.push(`updated_at = NOW()`);
    values.push(tenantId);

    await db.query(
      `UPDATE "FoiaTenants"
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}`,
      values
    );

    // Log event
    console.log('[TransparencyHandlers] Emitting foia.transparency.settings_updated', {
      tenant_id: tenantId,
      transparency_dashboard_enabled,
      transparency_public
    });

    res.json({
      success: true,
      data: {
        message: 'Transparency settings updated successfully',
        transparency_dashboard_enabled,
        transparency_public
      }
    });
  } catch (error) {
    console.error('[TransparencyHandlers] Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update transparency settings'
    });
  }
}

/**
 * Generate embeddable HTML widget for transparency dashboard
 */
function generateEmbedWidget(dashboard: any): string {
  const scoreColor = getScoreColor(dashboard.score);
  const latestMonth = dashboard.monthly_stats[0] || {};

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${dashboard.agency_name} - Transparency Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #f8f9fa;
      color: #212529;
    }
    .widget {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    .score-section {
      padding: 32px 24px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
    }
    .score-circle {
      width: 160px;
      height: 160px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: ${scoreColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      font-weight: bold;
      color: white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .percentile {
      font-size: 16px;
      color: #6c757d;
      margin-top: 8px;
    }
    .components {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      padding: 24px;
      border-bottom: 1px solid #e9ecef;
    }
    .component {
      text-align: center;
    }
    .component-label {
      font-size: 12px;
      color: #6c757d;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .component-score {
      font-size: 24px;
      font-weight: bold;
      color: #212529;
    }
    .stats {
      padding: 24px;
      background: #f8f9fa;
    }
    .stats h3 {
      font-size: 16px;
      margin-bottom: 16px;
      color: #495057;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #dee2e6;
    }
    .stat-row:last-child {
      border-bottom: none;
    }
    .stat-label {
      color: #6c757d;
      font-size: 14px;
    }
    .stat-value {
      font-weight: 600;
      color: #212529;
      font-size: 14px;
    }
    .footer {
      padding: 16px 24px;
      background: white;
      text-align: center;
      font-size: 12px;
      color: #6c757d;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="widget">
    <div class="header">
      <h1>${dashboard.agency_name}</h1>
      <p>Public Records Transparency Dashboard</p>
    </div>

    <div class="score-section">
      <div class="score-circle">${dashboard.score}</div>
      <div>Transparency Score</div>
      <div class="percentile">${dashboard.peer_percentile}th percentile among peers</div>
    </div>

    <div class="components">
      <div class="component">
        <div class="component-label">Response Time</div>
        <div class="component-score">${dashboard.components.response_time}/25</div>
      </div>
      <div class="component">
        <div class="component-label">On-Time Rate</div>
        <div class="component-score">${dashboard.components.on_time_rate}/25</div>
      </div>
      <div class="component">
        <div class="component-label">Proactive Disclosure</div>
        <div class="component-score">${dashboard.components.proactive_disclosure}/20</div>
      </div>
      <div class="component">
        <div class="component-label">Denial Rate</div>
        <div class="component-score">${dashboard.components.denial_rate}/15</div>
      </div>
      <div class="component">
        <div class="component-label">Appeal Reversal</div>
        <div class="component-score">${dashboard.components.appeal_reversal}/15</div>
      </div>
    </div>

    <div class="stats">
      <h3>Latest Month Performance</h3>
      <div class="stat-row">
        <span class="stat-label">Requests Received</span>
        <span class="stat-value">${latestMonth.requests_received || 0}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Median Response Time</span>
        <span class="stat-value">${latestMonth.median_response_days || 0} days</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">On-Time Rate</span>
        <span class="stat-value">${latestMonth.on_time_pct || 0}%</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Reading Room Entries</span>
        <span class="stat-value">${dashboard.reading_room_count}</span>
      </div>
    </div>

    <div class="footer">
      Last updated: ${new Date(dashboard.last_updated).toLocaleDateString()}
      <br>
      <a href="/public/transparency/${dashboard.agency_name.toLowerCase().replace(/\s+/g, '-')}" target="_blank">View Full Dashboard</a>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Get color based on transparency score
 */
function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // Green
  if (score >= 60) return '#eab308'; // Yellow
  if (score >= 40) return '#f97316'; // Orange
  return '#ef4444'; // Red
}
