/**
 * Govli AI FOIA Module - Smart Deflection Routes
 * AI-12: Deflection API routes
 */

import { Router } from 'express';
import {
  searchDeflection,
  logDeflectionOutcome,
  getDeflectionAnalytics,
  refreshEmbeddings
} from './handlers';

const router = Router();

// Public endpoints (rate limited)
router.post('/search', searchDeflection);
router.post('/log-outcome', logDeflectionOutcome);

// Protected endpoints (staff only)
router.get('/analytics', getDeflectionAnalytics);
router.post('/refresh-embeddings', refreshEmbeddings);

export default router;
