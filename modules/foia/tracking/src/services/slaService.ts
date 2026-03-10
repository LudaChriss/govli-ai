/**
 * FOIA SLA Service
 * Monitors SLA compliance and calculates breach risk
 */

import { Pool } from 'pg';
import { FoiaRequestStatus, emit } from '@govli/foia-shared';
import { SLAStatus, SLADashboard, OverdueAlert } from '../types';
import crypto from 'crypto';

/**
 * Status velocity multipliers
 * Higher values indicate faster-moving statuses (less risk)
 * Lower values indicate slower/stalled statuses (more risk)
 */
const STATUS_VELOCITY: Record<FoiaRequestStatus, number> = {
  PENDING: 0.5,           // Just received, minimal progress
  IN_REVIEW: 0.7,         // Being reviewed
  ASSIGNED: 0.8,          // Assigned but not started
  IN_PROGRESS: 1.0,       // Active work (baseline)
  AWAITING_RESPONSE: 0.3, // Stalled waiting for response (high risk)
  COMPLETED: 0.0,         // Done (no risk)
  DENIED: 0.0,            // Done (no risk)
  APPEALED: 0.6           // Appeal process (moderate risk)
};

/**
 * SLA Service
 */
export class SLAService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Calculate SLA status for a single request
   */
  async calculateSLAStatus(
    tenant_id: string,
    foia_request_id: string
  ): Promise<SLAStatus> {
    const result = await this.db.query(
      `SELECT * FROM foia_requests WHERE id = $1 AND tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    const request = result.rows[0];
    return this.calculateSLAForRequest(request);
  }

  /**
   * Calculate SLA status for a request object
   */
  private calculateSLAForRequest(request: any): SLAStatus {
    const now = new Date();
    const received_at = new Date(request.received_at);
    const due_date = request.due_date ? new Date(request.due_date) : null;

    if (!due_date) {
      // No due date - cannot calculate SLA
      return {
        foia_request_id: request.id,
        tenant_id: request.tenant_id,
        due_date: now,
        days_remaining: 0,
        days_elapsed: 0,
        total_days: 0,
        status: request.status,
        breach_risk_score: 0,
        is_overdue: false,
        sla_tier: 'GREEN',
        calculated_at: now
      };
    }

    // Calculate time metrics
    const days_elapsed = Math.floor((now.getTime() - received_at.getTime()) / (1000 * 60 * 60 * 24));
    const days_remaining = Math.floor((due_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const total_days = Math.floor((due_date.getTime() - received_at.getTime()) / (1000 * 60 * 60 * 24));
    const is_overdue = days_remaining < 0;

    // Calculate breach risk score
    const breach_risk_score = this.calculateBreachRisk(
      days_remaining,
      total_days,
      request.status
    );

    // Determine SLA tier
    const sla_tier = this.determineSLATier(breach_risk_score, is_overdue);

    return {
      foia_request_id: request.id,
      tenant_id: request.tenant_id,
      due_date,
      days_remaining,
      days_elapsed,
      total_days,
      status: request.status,
      breach_risk_score,
      is_overdue,
      sla_tier,
      calculated_at: now
    };
  }

  /**
   * Calculate breach risk score (0-100)
   * Formula: linear model on (days_remaining/total_days) * status_velocity
   *
   * - Higher score = higher risk of breach
   * - 0-30: GREEN (low risk)
   * - 31-60: YELLOW (moderate risk)
   * - 61-80: ORANGE (high risk)
   * - 81-100: RED (critical risk)
   */
  private calculateBreachRisk(
    days_remaining: number,
    total_days: number,
    status: FoiaRequestStatus
  ): number {
    // If already overdue, maximum risk
    if (days_remaining < 0) {
      return 100;
    }

    // If completed/denied, no risk
    if (status === 'COMPLETED' || status === 'DENIED') {
      return 0;
    }

    // Calculate time pressure (0-1, where 1 = very little time left)
    const time_pressure = total_days > 0
      ? 1 - (days_remaining / total_days)
      : 0;

    // Get status velocity (0-1, where lower = higher risk)
    const velocity = STATUS_VELOCITY[status] || 0.5;

    // Calculate base risk from time pressure
    // Invert velocity so lower velocity = higher risk
    const velocity_risk = 1 - velocity;

    // Combine time pressure and velocity risk
    // Weight: 60% time pressure, 40% velocity
    const combined_risk = (time_pressure * 0.6) + (velocity_risk * 0.4);

    // Scale to 0-100
    const risk_score = Math.round(combined_risk * 100);

    return Math.min(100, Math.max(0, risk_score));
  }

  /**
   * Determine SLA tier based on risk score
   */
  private determineSLATier(
    breach_risk_score: number,
    is_overdue: boolean
  ): 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' {
    if (is_overdue) {
      return 'RED';
    }

    if (breach_risk_score >= 81) {
      return 'RED';
    } else if (breach_risk_score >= 61) {
      return 'ORANGE';
    } else if (breach_risk_score >= 31) {
      return 'YELLOW';
    } else {
      return 'GREEN';
    }
  }

  /**
   * Get SLA dashboard for all active requests
   */
  async getSLADashboard(tenant_id: string): Promise<SLADashboard> {
    // Get all active requests (not completed or denied)
    const result = await this.db.query(
      `SELECT * FROM foia_requests
       WHERE tenant_id = $1 AND status NOT IN ('COMPLETED', 'DENIED')
       ORDER BY due_date ASC`,
      [tenant_id]
    );

    const requests = result.rows;

    // Calculate SLA status for each request
    const sla_statuses: SLAStatus[] = requests.map(req => this.calculateSLAForRequest(req));

    // Aggregate metrics
    const total_requests = sla_statuses.length;
    const on_track = sla_statuses.filter(s => s.sla_tier === 'GREEN').length;
    const at_risk = sla_statuses.filter(s => s.sla_tier === 'YELLOW' || s.sla_tier === 'ORANGE').length;
    const overdue = sla_statuses.filter(s => s.is_overdue).length;

    const by_tier = {
      GREEN: sla_statuses.filter(s => s.sla_tier === 'GREEN').length,
      YELLOW: sla_statuses.filter(s => s.sla_tier === 'YELLOW').length,
      ORANGE: sla_statuses.filter(s => s.sla_tier === 'ORANGE').length,
      RED: sla_statuses.filter(s => s.sla_tier === 'RED').length
    };

    const average_breach_risk = total_requests > 0
      ? sla_statuses.reduce((sum, s) => sum + s.breach_risk_score, 0) / total_requests
      : 0;

    return {
      total_requests,
      on_track,
      at_risk,
      overdue,
      by_tier,
      average_breach_risk,
      requests: sla_statuses
    };
  }

  /**
   * Get overdue alerts
   */
  async getOverdueAlerts(tenant_id: string): Promise<OverdueAlert[]> {
    const result = await this.db.query(
      `SELECT
        id as foia_request_id,
        tenant_id,
        requester_name,
        subject,
        due_date,
        assigned_to,
        status,
        received_at
       FROM foia_requests
       WHERE tenant_id = $1
         AND status NOT IN ('COMPLETED', 'DENIED')
         AND due_date < NOW()
       ORDER BY due_date ASC`,
      [tenant_id]
    );

    const now = new Date();
    const alerts: OverdueAlert[] = result.rows.map(row => {
      const due_date = new Date(row.due_date);
      const days_overdue = Math.floor((now.getTime() - due_date.getTime()) / (1000 * 60 * 60 * 24));

      // Calculate breach risk (already overdue, so 100)
      const breach_risk_score = 100;

      return {
        foia_request_id: row.foia_request_id,
        tenant_id: row.tenant_id,
        requester_name: row.requester_name,
        subject: row.subject,
        due_date,
        days_overdue,
        assigned_to: row.assigned_to,
        status: row.status,
        breach_risk_score
      };
    });

    return alerts;
  }

  /**
   * Get SLA wall display data
   * Returns all active requests sorted by breach_risk_score DESC
   * with urgency buckets for full-screen SLA wall display
   */
  async getSLAWall(tenant_id: string): Promise<{
    requests: Array<{
      foia_request_id: string;
      tracking_number: string;
      requester_name: string;
      subject: string;
      status: FoiaRequestStatus;
      due_date: Date;
      days_remaining: number;
      breach_risk_score: number;
      urgency_bucket: 'OVERDUE' | 'CRITICAL' | 'AT_RISK' | 'ON_TRACK';
      sla_tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
      assigned_to?: string;
    }>;
    summary: {
      overdue: number;
      critical: number;
      at_risk: number;
      on_track: number;
    };
  }> {
    // Get all active requests with breach_risk_score
    const result = await this.db.query(
      `SELECT
        id,
        tracking_number,
        requester_name,
        subject,
        status,
        due_date,
        breach_risk_score,
        assigned_to,
        received_at
       FROM foia_requests
       WHERE tenant_id = $1 AND status NOT IN ('COMPLETED', 'DENIED')
       ORDER BY breach_risk_score DESC NULLS LAST, due_date ASC`,
      [tenant_id]
    );

    const now = new Date();
    const requests = result.rows.map(row => {
      const due_date = row.due_date ? new Date(row.due_date) : null;
      const received_at = new Date(row.received_at);

      // Calculate days remaining
      const days_remaining = due_date
        ? Math.floor((due_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Use stored breach_risk_score or calculate it
      const breach_risk_score = row.breach_risk_score || 0;

      // Determine urgency bucket
      let urgency_bucket: 'OVERDUE' | 'CRITICAL' | 'AT_RISK' | 'ON_TRACK';
      if (days_remaining < 0) {
        urgency_bucket = 'OVERDUE';
      } else if (breach_risk_score >= 81) {
        urgency_bucket = 'CRITICAL';
      } else if (breach_risk_score >= 61) {
        urgency_bucket = 'AT_RISK';
      } else {
        urgency_bucket = 'ON_TRACK';
      }

      // Determine SLA tier
      const sla_tier = this.determineSLATier(breach_risk_score, days_remaining < 0);

      return {
        foia_request_id: row.id,
        tracking_number: row.tracking_number,
        requester_name: row.requester_name,
        subject: row.subject,
        status: row.status as FoiaRequestStatus,
        due_date: due_date || now,
        days_remaining,
        breach_risk_score,
        urgency_bucket,
        sla_tier,
        assigned_to: row.assigned_to
      };
    });

    // Calculate summary
    const summary = {
      overdue: requests.filter(r => r.urgency_bucket === 'OVERDUE').length,
      critical: requests.filter(r => r.urgency_bucket === 'CRITICAL').length,
      at_risk: requests.filter(r => r.urgency_bucket === 'AT_RISK').length,
      on_track: requests.filter(r => r.urgency_bucket === 'ON_TRACK').length
    };

    return {
      requests,
      summary
    };
  }

  /**
   * Check SLA thresholds and emit warning events (for cron job)
   */
  async checkSLAThresholds(tenant_id: string): Promise<void> {
    const dashboard = await this.getSLADashboard(tenant_id);

    // Emit warnings for high-risk requests
    for (const request of dashboard.requests) {
      if (request.sla_tier === 'ORANGE' || request.sla_tier === 'RED') {
        await emit({
          id: crypto.randomUUID(),
          tenant_id,
          event_type: 'foia.sla.warning',
          entity_id: request.foia_request_id,
          entity_type: 'foia_request',
          metadata: {
            sla_tier: request.sla_tier,
            breach_risk_score: request.breach_risk_score,
            days_remaining: request.days_remaining,
            is_overdue: request.is_overdue
          },
          timestamp: new Date()
        });
      }
    }

    // Emit overdue alerts
    if (dashboard.overdue > 0) {
      await emit({
        id: crypto.randomUUID(),
        tenant_id,
        event_type: 'foia.sla.overdue.alert',
        entity_id: tenant_id,
        entity_type: 'tenant',
        metadata: {
          overdue_count: dashboard.overdue,
          total_requests: dashboard.total_requests
        },
        timestamp: new Date()
      });
    }
  }
}
