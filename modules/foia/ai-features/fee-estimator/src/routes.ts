/**
 * Govli AI FOIA Module - Fee Estimator Routes
 * API routes for fee estimation endpoints
 */

import express from 'express';
import { estimateFee, getFeeEstimate, trackAccuracy } from './handlers';

const router = express.Router();

/**
 * POST /ai/fees/estimate
 * Generate fee estimate for a FOIA request
 */
router.post('/ai/fees/estimate', estimateFee);

/**
 * GET /ai/fees/estimate/:foiaRequestId
 * Retrieve stored fee estimate for a request
 */
router.get('/ai/fees/estimate/:foiaRequestId', getFeeEstimate);

/**
 * POST /ai/fees/accuracy-tracking
 * Update fee estimate with actual values for accuracy tracking
 */
router.post('/ai/fees/accuracy-tracking', trackAccuracy);

export default router;
