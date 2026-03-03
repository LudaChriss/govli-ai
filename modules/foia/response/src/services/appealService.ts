/**
 * FOIA Appeal Service
 * Manages appeal submissions and processing
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { emit } from '@govli/foia-shared';
import { Appeal, AppealRequest, AppealStatus } from '../types';

/**
 * Appeal Service
 */
export class AppealService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Submit an appeal
   */
  async submitAppeal(
    tenant_id: string,
    foia_request_id: string,
    user_id: string,
    appeal: AppealRequest
  ): Promise<Appeal> {
    // Verify request exists
    const requestResult = await this.db.query(
      `SELECT * FROM foia_requests WHERE id = $1 AND tenant_id = $2`,
      [foia_request_id, tenant_id]
    );

    if (requestResult.rows.length === 0) {
      throw new Error('FOIA request not found');
    }

    // Get most recent response if exists
    const responseResult = await this.db.query(
      `SELECT id FROM foia_responses
       WHERE foia_request_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [foia_request_id]
    );

    const response_id = responseResult.rows.length > 0 ? responseResult.rows[0].id : null;

    // Create appeal
    const appealId = crypto.randomUUID();

    const result = await this.db.query(
      `INSERT INTO foia_appeals (
        id, tenant_id, foia_request_id, response_id,
        status, reason, additional_info,
        created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *`,
      [
        appealId,
        tenant_id,
        foia_request_id,
        response_id,
        'PENDING',
        appeal.reason,
        appeal.additional_info,
        user_id
      ]
    );

    const newAppeal = result.rows[0] as Appeal;

    // Update FOIA request status to APPEALED
    await this.db.query(
      `UPDATE foia_requests
       SET status = 'APPEALED', updated_at = NOW()
       WHERE id = $1`,
      [foia_request_id]
    );

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.appeal.submitted',
      entity_id: foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        appeal_id: appealId,
        reason: appeal.reason
      },
      timestamp: new Date()
    });

    return newAppeal;
  }

  /**
   * Update appeal status
   */
  async updateAppealStatus(
    tenant_id: string,
    appeal_id: string,
    user_id: string,
    status: AppealStatus,
    review_notes?: string,
    resolution?: string
  ): Promise<Appeal> {
    // Verify appeal exists
    const appealResult = await this.db.query(
      `SELECT a.* FROM foia_appeals a
       JOIN foia_requests fr ON fr.id = a.foia_request_id
       WHERE a.id = $1 AND fr.tenant_id = $2`,
      [appeal_id, tenant_id]
    );

    if (appealResult.rows.length === 0) {
      throw new Error('Appeal not found');
    }

    const appeal = appealResult.rows[0];

    // Update appeal
    const updateResult = await this.db.query(
      `UPDATE foia_appeals
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           review_notes = $3,
           resolution = $4,
           resolved_at = CASE WHEN $1 IN ('GRANTED', 'DENIED', 'PARTIALLY_GRANTED') THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [status, user_id, review_notes, resolution, appeal_id]
    );

    const updatedAppeal = updateResult.rows[0] as Appeal;

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.appeal.status.updated',
      entity_id: appeal.foia_request_id,
      entity_type: 'foia_request',
      user_id,
      metadata: {
        appeal_id,
        status
      },
      timestamp: new Date()
    });

    return updatedAppeal;
  }

  /**
   * Get appeal by ID
   */
  async getAppeal(tenant_id: string, appeal_id: string): Promise<Appeal> {
    const result = await this.db.query(
      `SELECT a.* FROM foia_appeals a
       JOIN foia_requests fr ON fr.id = a.foia_request_id
       WHERE a.id = $1 AND fr.tenant_id = $2`,
      [appeal_id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Appeal not found');
    }

    return result.rows[0] as Appeal;
  }

  /**
   * Get appeals for a request
   */
  async getAppealsForRequest(
    tenant_id: string,
    foia_request_id: string
  ): Promise<Appeal[]> {
    const result = await this.db.query(
      `SELECT a.* FROM foia_appeals a
       JOIN foia_requests fr ON fr.id = a.foia_request_id
       WHERE a.foia_request_id = $1 AND fr.tenant_id = $2
       ORDER BY a.created_at DESC`,
      [foia_request_id, tenant_id]
    );

    return result.rows as Appeal[];
  }
}
