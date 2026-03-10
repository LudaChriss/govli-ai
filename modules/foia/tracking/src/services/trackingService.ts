/**
 * FOIA Tracking Service
 * Manages request timeline, state transitions, and tracking
 */

import { Pool } from 'pg';
import { FoiaRequestStatus, emit } from '@govli/foia-shared';
import { TimelineEvent, StateTransitionRequest, DeadlineExtension } from '../types';
import { stateMachine } from './stateMachine';
import { SLAService } from './slaService';
import crypto from 'crypto';

/**
 * Tracking Service
 */
export class TrackingService {
  private db: Pool;
  private slaService: SLAService;

  constructor(db: Pool) {
    this.db = db;
    this.slaService = new SLAService(db);
  }

  /**
   * Get timeline for a FOIA request
   */
  async getTimeline(
    tenant_id: string,
    foia_request_id: string
  ): Promise<TimelineEvent[]> {
    const result = await this.db.query(
      `SELECT * FROM foia_timeline_events
       WHERE tenant_id = $1 AND foia_request_id = $2
       ORDER BY created_at DESC`,
      [tenant_id, foia_request_id]
    );

    return result.rows as TimelineEvent[];
  }

  /**
   * Transition request to new status (with state machine validation)
   */
  async transitionStatus(
    tenant_id: string,
    foia_request_id: string,
    user_id: string,
    transition: StateTransitionRequest
  ): Promise<{ request: any; timeline_event: TimelineEvent }> {
    // Get current request
    const requestResult = await this.db.query(
      `SELECT * FROM foia_requests WHERE id = $1 AND tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    const request = requestResult.rows[0];
    const currentStatus: FoiaRequestStatus = request.status;
    const newStatus: FoiaRequestStatus = transition.to_status;

    // Validate transition
    stateMachine.validateTransition(currentStatus, newStatus);

    // Update request status
    const updateResult = await this.db.query(
      `UPDATE foia_requests
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [newStatus, foia_request_id, tenant_id]
    );

    const updatedRequest = updateResult.rows[0];

    // Calculate and update breach_risk_score (A-3 Tracking v2.0)
    try {
      const slaStatus = await this.slaService.calculateSLAStatus(tenant_id, foia_request_id);

      // Update breach_risk_score in database
      await this.db.query(
        `UPDATE foia_requests
         SET breach_risk_score = $1
         WHERE id = $2 AND tenant_id = $3`,
        [slaStatus.breach_risk_score, foia_request_id, tenant_id]
      );

      updatedRequest.breach_risk_score = slaStatus.breach_risk_score;

      // Emit WebSocket event for SLA dashboard update
      await emit({
        id: crypto.randomUUID(),
        tenant_id,
        event_type: 'foia.sla.risk_updated',
        entity_id: foia_request_id,
        entity_type: 'foia_request',
        user_id,
        metadata: {
          request_id: foia_request_id,
          risk_score: slaStatus.breach_risk_score,
          days_remaining: slaStatus.days_remaining,
          status: newStatus,
          sla_tier: slaStatus.sla_tier,
          is_overdue: slaStatus.is_overdue
        },
        timestamp: new Date()
      });
    } catch (slaError) {
      // Log SLA calculation error but don't fail the transition
      console.error('[TrackingService] SLA calculation error:', slaError);
    }

    // Create timeline event
    const timelineEvent = await this.addTimelineEvent(
      tenant_id,
      foia_request_id,
      'STATUS_CHANGED',
      user_id,
      {
        from_status: currentStatus,
        to_status: newStatus,
        reason: transition.reason,
        ...transition.metadata
      }
    );

    // Emit analytics event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.request.status.changed',
      entity_id: foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        from_status: currentStatus,
        to_status: newStatus,
        reason: transition.reason
      },
      timestamp: new Date()
    });

    return {
      request: updatedRequest,
      timeline_event: timelineEvent
    };
  }

  /**
   * Add event to timeline
   */
  async addTimelineEvent(
    tenant_id: string,
    foia_request_id: string,
    event_type: string,
    user_id: string,
    metadata: Record<string, any>
  ): Promise<TimelineEvent> {
    const eventId = crypto.randomUUID();

    // Get user name
    let user_name: string | undefined;
    try {
      const userResult = await this.db.query(
        `SELECT name FROM users WHERE id = $1`,
        [user_id]
      );
      if (userResult.rows.length > 0) {
        user_name = userResult.rows[0].name;
      }
    } catch (error) {
      // User lookup failed, continue without name
    }

    const result = await this.db.query(
      `INSERT INTO foia_timeline_events (
        id, tenant_id, foia_request_id, event_type,
        from_status, to_status, user_id, user_name, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [
        eventId,
        tenant_id,
        foia_request_id,
        event_type,
        metadata.from_status || null,
        metadata.to_status || null,
        user_id,
        user_name,
        JSON.stringify(metadata)
      ]
    );

    return result.rows[0] as TimelineEvent;
  }

  /**
   * Request deadline extension
   */
  async requestDeadlineExtension(
    tenant_id: string,
    foia_request_id: string,
    extension_days: number,
    reason: string,
    requested_by: string
  ): Promise<DeadlineExtension> {
    // Get current request
    const requestResult = await this.db.query(
      `SELECT * FROM foia_requests WHERE id = $1 AND tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    const request = requestResult.rows[0];
    const old_due_date = new Date(request.due_date);

    if (!request.due_date) {
      throw new Error('Request has no due date');
    }

    // Calculate new due date
    const new_due_date = new Date(old_due_date);
    new_due_date.setDate(new_due_date.getDate() + extension_days);

    // Create extension request
    const extensionId = crypto.randomUUID();
    const result = await this.db.query(
      `INSERT INTO foia_deadline_extensions (
        id, tenant_id, foia_request_id, old_due_date, new_due_date,
        extension_days, reason, requested_by, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *`,
      [
        extensionId,
        tenant_id,
        foia_request_id,
        old_due_date,
        new_due_date,
        extension_days,
        reason,
        requested_by,
        'PENDING'
      ]
    );

    const extension = result.rows[0] as DeadlineExtension;

    // Add timeline event
    await this.addTimelineEvent(
      tenant_id,
      foia_request_id,
      'DEADLINE_EXTENDED',
      requested_by,
      {
        extension_id: extensionId,
        old_due_date: old_due_date.toISOString(),
        new_due_date: new_due_date.toISOString(),
        extension_days,
        reason
      }
    );

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.deadline.extension.requested',
      entity_id: foia_request_id,
      entity_type: 'foia_request',
      user_id: requested_by,
      metadata: {
        extension_id: extensionId,
        extension_days,
        reason
      },
      timestamp: new Date()
    });

    return extension;
  }

  /**
   * Approve deadline extension
   */
  async approveDeadlineExtension(
    tenant_id: string,
    extension_id: string,
    approved_by: string
  ): Promise<DeadlineExtension> {
    // Get extension
    const extensionResult = await this.db.query(
      `SELECT e.*, r.tenant_id
       FROM foia_deadline_extensions e
       JOIN foia_requests r ON r.id = e.foia_request_id
       WHERE e.id = $1 AND r.tenant_id = $2`,
      [extension_id, tenant_id]
    );

    if (extensionResult.rows.length === 0) {
      throw new Error('Extension request not found');
    }

    const extension = extensionResult.rows[0];

    // Update extension status
    await this.db.query(
      `UPDATE foia_deadline_extensions
       SET status = 'APPROVED', approved_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [approved_by, extension_id]
    );

    // Update request due date
    await this.db.query(
      `UPDATE foia_requests
       SET due_date = $1, updated_at = NOW()
       WHERE id = $2`,
      [extension.new_due_date, extension.foia_request_id]
    );

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.deadline.extension.approved',
      entity_id: extension.foia_request_id,
      entity_type: 'foia_request',
      user_id: approved_by,
      metadata: {
        extension_id,
        new_due_date: extension.new_due_date
      },
      timestamp: new Date()
    });

    extension.status = 'APPROVED';
    extension.approved_by = approved_by;
    return extension;
  }

  /**
   * Get valid next states for a request
   */
  getValidNextStates(current_status: FoiaRequestStatus): FoiaRequestStatus[] {
    return stateMachine.getValidNextStates(current_status);
  }
}
