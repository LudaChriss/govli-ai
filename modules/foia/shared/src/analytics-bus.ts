/**
 * Govli AI FOIA Module - Analytics Event Bus
 * Handles emission of analytics events for tracking and metrics
 */

import { GovliEvent } from './types';

/**
 * Analytics Bus Interface
 */
export interface IAnalyticsBus {
  emit(event: GovliEvent): Promise<void>;
  emitBatch(events: GovliEvent[]): Promise<void>;
}

/**
 * Console Analytics Bus (Development/Testing)
 * Logs events to console for development and testing
 */
export class ConsoleAnalyticsBus implements IAnalyticsBus {
  async emit(event: GovliEvent): Promise<void> {
    console.log('[AnalyticsBus]', event.event_type, {
      id: event.id,
      tenant_id: event.tenant_id,
      event_type: event.event_type,
      entity_id: event.entity_id,
      entity_type: event.entity_type,
      user_id: event.user_id,
      metadata: event.metadata,
      timestamp: event.timestamp
    });
  }

  async emitBatch(events: GovliEvent[]): Promise<void> {
    console.log(`[AnalyticsBus] Batch emit: ${events.length} events`);
    for (const event of events) {
      await this.emit(event);
    }
  }
}

/**
 * Production Analytics Bus
 * Publishes events to message queue (Kafka, RabbitMQ, etc.)
 */
export class ProductionAnalyticsBus implements IAnalyticsBus {
  private messageQueue: any; // In production, use actual message queue client

  constructor(messageQueue?: any) {
    this.messageQueue = messageQueue;
  }

  async emit(event: GovliEvent): Promise<void> {
    if (!this.messageQueue) {
      console.warn('[AnalyticsBus] No message queue configured, skipping event emission');
      return;
    }

    try {
      // In production, publish to message queue
      // Example: await this.messageQueue.publish('govli.analytics', event);
      console.log('[AnalyticsBus]', event.event_type, event);
    } catch (error) {
      console.error('[AnalyticsBus] Failed to emit event:', error);
      // Don't throw - analytics failures shouldn't break the main flow
    }
  }

  async emitBatch(events: GovliEvent[]): Promise<void> {
    if (!this.messageQueue) {
      console.warn('[AnalyticsBus] No message queue configured, skipping batch emission');
      return;
    }

    try {
      // In production, batch publish to message queue
      console.log(`[AnalyticsBus] Batch emit: ${events.length} events`);
      for (const event of events) {
        await this.emit(event);
      }
    } catch (error) {
      console.error('[AnalyticsBus] Failed to emit batch:', error);
    }
  }
}

/**
 * Global analytics bus instance
 */
let analyticsBusInstance: IAnalyticsBus = new ConsoleAnalyticsBus();

/**
 * Get the current analytics bus instance
 */
export function getAnalyticsBus(): IAnalyticsBus {
  return analyticsBusInstance;
}

/**
 * Set a custom analytics bus instance
 * @param bus Custom analytics bus implementation
 */
export function setAnalyticsBus(bus: IAnalyticsBus): void {
  analyticsBusInstance = bus;
}

/**
 * Emit a single analytics event
 * @param event The event to emit
 */
export async function emit(event: GovliEvent): Promise<void> {
  await analyticsBusInstance.emit(event);
}

/**
 * Emit multiple analytics events
 * @param events Array of events to emit
 */
export async function emitBatch(events: GovliEvent[]): Promise<void> {
  await analyticsBusInstance.emitBatch(events);
}

/**
 * Create a standard FOIA event
 */
export function createFoiaEvent(
  eventType: string,
  entityId: string,
  tenantId: string,
  metadata: Record<string, any>,
  userId?: string
): GovliEvent {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    event_type: eventType,
    entity_id: entityId,
    entity_type: 'foia_request',
    user_id: userId,
    metadata,
    timestamp: new Date()
  };
}

// Export default instance methods
export default {
  emit,
  emitBatch,
  getAnalyticsBus,
  setAnalyticsBus,
  createFoiaEvent,
  ConsoleAnalyticsBus,
  ProductionAnalyticsBus
};
