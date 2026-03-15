/**
 * AI-16: Public Transparency Dashboard & Score - Routes
 */

import { Router } from 'express';
import {
  calculateScores,
  getPublicDashboard,
  getEmbedWidget,
  getAdminDashboard,
  updateSettings
} from './handlers';

/**
 * Create transparency dashboard routes
 */
export function createTransparencyRoutes(): Router {
  const router = Router();

  // ==========================================================================
  // PUBLIC ROUTES (no auth required)
  // ==========================================================================

  // GET /public/transparency/:agencySlug - Public dashboard data
  router.get('/public/transparency/:agencySlug', getPublicDashboard);

  // GET /public/transparency/:agencySlug/embed - Embeddable widget
  router.get('/public/transparency/:agencySlug/embed', getEmbedWidget);

  // ==========================================================================
  // ADMIN ROUTES (auth required: foia_supervisor+)
  // ==========================================================================

  // POST /ai/transparency/calculate - Manual score calculation
  // Auth: foia_supervisor+
  router.post('/ai/transparency/calculate', calculateScores);

  // GET /api/v1/foia/transparency/admin - Admin dashboard
  // Auth: foia_supervisor+
  router.get('/api/v1/foia/transparency/admin', getAdminDashboard);

  // PUT /api/v1/foia/transparency/settings - Update settings
  // Auth: foia_supervisor+
  router.put('/api/v1/foia/transparency/settings', updateSettings);

  return router;
}
