// @govli/foia-batch-intelligence
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * AI-13: Batch Request Optimization
 * Detect and manage batch processing opportunities
 */

export { default as batchRouter } from './routes';
export { BatchService } from './services/batchService';
export { setupBatchDetectionSubscriber, triggerBatchDetection } from './events/batchDetectionSubscriber';
export type { BatchOpportunity, BatchAnalytics } from './services/batchService';
export { setDatabasePool } from './handlers';
