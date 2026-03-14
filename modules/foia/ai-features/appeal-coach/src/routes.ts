/**
 * Govli AI FOIA Module - Appeal Coach Routes
 * API routes for appeal analysis and drafting
 */

import express from 'express';
import { analyzeAppeal, draftAppeal, getCoachSessions } from './handlers';

const router = express.Router();

/**
 * POST /ai/appeal-coach/analyze
 * Analyze a FOIA response and provide appeal guidance
 */
router.post('/ai/appeal-coach/analyze', analyzeAppeal);

/**
 * POST /ai/appeal-coach/draft-appeal
 * Draft a formal FOIA appeal letter
 */
router.post('/ai/appeal-coach/draft-appeal', draftAppeal);

/**
 * GET /ai/appeal-coach/sessions/:confirmationNumber
 * Get session history for a confirmation number
 */
router.get('/ai/appeal-coach/sessions/:confirmationNumber', getCoachSessions);

export default router;