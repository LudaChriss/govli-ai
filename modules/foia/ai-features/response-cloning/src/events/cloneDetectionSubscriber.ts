/**
 * AI-15: Clone Detection Event Subscriber
 *
 * Subscribes to foia.request.submitted events and detects clone candidates
 * after AI-1 Scoping runs
 */

import { Pool } from 'pg';
import { CloningService } from '../services/cloningService';

interface RequestSubmittedEvent {
  request_id: string;
  tenant_id: string;
  description: string;
  requester_category: string;
  department: string;
  submitted_at: Date;
}

/**
 * CloneDetectionSubscriber listens for request submissions and detects clone opportunities
 */
export class CloneDetectionSubscriber {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Handle foia.request.submitted event
   * This runs AFTER AI-1 Scoping has completed
   */
  async handleRequestSubmitted(event: RequestSubmittedEvent): Promise<void> {
    try {
      console.log('[CloneDetectionSubscriber] Processing request:', event.request_id);

      const cloningService = new CloningService(this.db, event.tenant_id);

      // Detect clone candidates
      const candidates = await cloningService.detectCloneCandidates(
        event.request_id,
        event.description,
        event.requester_category,
        event.department
      );

      console.log('[CloneDetectionSubscriber] Found', candidates.length, 'clone candidates');

      // Create suggestion records for each candidate
      for (const candidate of candidates) {
        await cloningService.createCloneSuggestion(
          event.request_id,
          candidate.source_request_id,
          candidate.similarity_score
        );
      }

      if (candidates.length > 0) {
        console.log('[CloneDetectionSubscriber] Emitting foia.ai.clone.candidate_detected');
        // In production, emit event via event bus
        // emit('foia.ai.clone.candidate_detected', {
        //   request_id: event.request_id,
        //   candidate_count: candidates.length
        // });
      }
    } catch (error) {
      console.error('[CloneDetectionSubscriber] Error detecting clones:', error);
      // Don't throw - clone detection is non-critical
    }
  }
}

/**
 * Setup function to register the subscriber
 */
export function setupCloneDetectionSubscriber(db: Pool): CloneDetectionSubscriber {
  const subscriber = new CloneDetectionSubscriber(db);

  console.log('[CloneDetectionSubscriber] Registered for foia.request.submitted events');

  // In production, register with event bus:
  // eventBus.on('foia.request.submitted', (event) => subscriber.handleRequestSubmitted(event));

  return subscriber;
}

/**
 * Manual trigger for testing/backfill
 */
export async function triggerCloneDetection(
  db: Pool,
  requestId: string,
  tenantId: string,
  description: string,
  requesterCategory: string,
  department: string
): Promise<number> {
  const subscriber = new CloneDetectionSubscriber(db);

  await subscriber.handleRequestSubmitted({
    request_id: requestId,
    tenant_id: tenantId,
    description,
    requester_category: requesterCategory,
    department,
    submitted_at: new Date()
  });

  // Return candidate count
  const result = await db.query(
    `SELECT COUNT(*) as count FROM "FoiaResponseClones"
     WHERE target_request_id = $1 AND clone_status = 'SUGGESTED'`,
    [requestId]
  );

  return parseInt(result.rows[0].count);
}
