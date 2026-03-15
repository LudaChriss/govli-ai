// @govli/foia-smart-deflection
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * AI-12: Smart Reading Room Deflection
 * Semantic search to prevent duplicate requests
 */

export { default as deflectionRouter } from './routes';
export { DeflectionService } from './services/deflectionService';
export type { DeflectionMatch, DeflectionResult, DeflectionAnalytics } from './services/deflectionService';
export { setDatabasePool } from './handlers';
