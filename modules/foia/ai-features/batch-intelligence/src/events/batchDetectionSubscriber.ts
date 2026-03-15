/**
 * Govli AI FOIA Module - Batch Detection Event Subscriber
 * AI-13: Listen for new requests and detect batch opportunities
 */

import { Pool } from 'pg';
import { BatchService } from '../services/batchService';

export interface RequestSubmittedEvent {
  request_id: string;
  tenant_id: string;
  description: string;
  requester_id: string;
  requester_email: string;
  timestamp: string;
}

/**
 * Batch Detection Subscriber
 * Listens to foia.request.submitted events
 */
export class BatchDetectionSubscriber {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Handle new request submission
   */
  async handleRequestSubmitted(event: RequestSubmittedEvent): Promise<void> {
    const { request_id, tenant_id, description } = event;

    console.log(`[BatchDetection] Processing request ${request_id} for batch opportunities...`);

    try {
      const batchService = new BatchService(this.db, tenant_id);

      // Detect batch opportunities
      const opportunities = await batchService.detectBatchOpportunities(
        request_id,
        description
      );

      if (opportunities.length > 0) {
        console.log(`[BatchDetection] Found ${opportunities.length} batch opportunities for request ${request_id}`);

        // Emit batch opportunity detected events
        for (const opportunity of opportunities) {
          this.emitBatchOpportunityDetected(opportunity);
        }
      } else {
        console.log(`[BatchDetection] No batch opportunities found for request ${request_id}`);
      }

    } catch (error) {
      console.error(`[BatchDetection] Error processing request ${request_id}:`, error);
      // Don't throw - batch detection is non-critical
    }
  }

  /**
   * Emit batch opportunity detected event
   * In production, this would integrate with an event bus
   */
  private emitBatchOpportunityDetected(opportunity: any): void {
    // Example event emission (replace with actual event bus)
    console.log('[BatchDetection] Emitting foia.ai.batch.opportunity_detected', {
      opportunity_id: opportunity.id,
      group_id: opportunity.group_id,
      tenant_id: opportunity.tenant_id,
      recommended_action: opportunity.recommended_action,
      similarity_score: opportunity.similarity_score,
      request_count: opportunity.request_ids.length
    });

    // In production:
    // emit('foia.ai.batch.opportunity_detected', opportunity);
  }
}

/**
 * Setup event subscription
 * Call this during application initialization
 */
export function setupBatchDetectionSubscriber(db: Pool): void {
  const subscriber = new BatchDetectionSubscriber(db);

  // In production, subscribe to event bus:
  // eventBus.on('foia.request.submitted', (event) => {
  //   subscriber.handleRequestSubmitted(event);
  // });

  console.log('[BatchDetection] Event subscriber initialized');
}

/**
 * Example manual trigger for testing
 */
export async function triggerBatchDetection(
  db: Pool,
  requestId: string,
  tenantId: string,
  description: string,
  requesterId: string,
  requesterEmail: string
): Promise<void> {
  const subscriber = new BatchDetectionSubscriber(db);

  await subscriber.handleRequestSubmitted({
    request_id: requestId,
    tenant_id: tenantId,
    description,
    requester_id: requesterId,
    requester_email: requesterEmail,
    timestamp: new Date().toISOString()
  });
}
