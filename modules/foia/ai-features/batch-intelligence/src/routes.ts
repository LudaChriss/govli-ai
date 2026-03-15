/**
 * Govli AI FOIA Module - Batch Intelligence Routes
 * AI-13: Batch processing API routes
 */

import { Router } from 'express';
import {
  getOpportunities,
  executeAction,
  getAnalytics,
  triggerDetection
} from './handlers';

const router = Router();

// Batch opportunity management
router.get('/opportunities', getOpportunities);
router.post('/opportunities/:opportunityId/action', executeAction);

// Analytics
router.get('/analytics', getAnalytics);

// Manual trigger (admin/testing)
router.post('/detect/:requestId', triggerDetection);

export default router;
