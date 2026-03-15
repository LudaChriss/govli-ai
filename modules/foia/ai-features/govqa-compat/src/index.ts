// @govli/foia-govqa-compat
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * GovQA Compatibility API Layer
 *
 * Provides backward-compatible endpoints for agencies migrating from GovQA
 */

// Services
export {
  govqaToGovli,
  govliToGovqa,
  govliDocumentToGovqa,
  govliTimelineToGovqaMessage,
  parseGovqaFilters,
  govliErrorToGovqa
} from './services/fieldMapper';

export type {
  GovQACase,
  GovliRequest,
  GovQADocument,
  GovQAMessage
} from './services/fieldMapper';

// Middleware
export {
  compatMiddleware,
  addCompatHeaders,
  logCompatRequest
} from './middleware/compatMiddleware';

// Handlers
export {
  createCase,
  getCase,
  listCases,
  getCaseDocuments,
  uploadCaseDocument,
  getCaseMessages,
  processCasePayment,
  exportReport,
  getCompatUsage
} from './handlers';

// Routes
export { createGovQACompatRoutes } from './routes';
