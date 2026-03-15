/**
 * GovQA Compatibility API Layer - Routes
 */

import { Router } from 'express';
import { compatMiddleware } from './middleware/compatMiddleware';
import {
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

/**
 * Create GovQA compatibility routes
 */
export function createGovQACompatRoutes(): Router {
  const router = Router();

  // Apply compatibility middleware to all GovQA compat routes
  router.use('/api/compat/govqa', compatMiddleware);

  // ==========================================================================
  // GOVQA COMPATIBILITY ENDPOINTS
  // ==========================================================================

  // Cases
  router.post('/api/compat/govqa/cases', createCase);
  router.get('/api/compat/govqa/cases/:caseNumber', getCase);
  router.get('/api/compat/govqa/cases', listCases);

  // Documents
  router.get('/api/compat/govqa/cases/:caseNumber/documents', getCaseDocuments);
  router.post('/api/compat/govqa/cases/:caseNumber/documents', uploadCaseDocument);

  // Messages
  router.get('/api/compat/govqa/cases/:caseNumber/messages', getCaseMessages);

  // Payments
  router.post('/api/compat/govqa/cases/:caseNumber/payment', processCasePayment);

  // Reports
  router.get('/api/compat/govqa/reports/export', exportReport);

  // ==========================================================================
  // MIGRATION TRACKING ENDPOINT (Native Govli API)
  // ==========================================================================

  // Migration tracking dashboard (foia_admin only)
  router.get('/api/v1/foia/migration/compat-usage', getCompatUsage);

  return router;
}
