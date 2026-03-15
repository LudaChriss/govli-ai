/**
 * AI-15: Response Cloning Routes
 */

import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

// Clone candidates and detection
router.get('/cloning/:foiaRequestId/candidates', handlers.getCandidates);
router.post('/cloning/:foiaRequestId/detect', handlers.triggerDetection);

// Clone execution and review
router.post('/cloning/:foiaRequestId/clone', handlers.executeClone);
router.get('/cloning/:foiaRequestId/review', handlers.getReview);

// Clone approval/rejection
router.post('/cloning/:foiaRequestId/approve', handlers.approveClone);
router.post('/cloning/:foiaRequestId/reject', handlers.rejectClone);

// Analytics
router.get('/cloning/analytics', handlers.getAnalytics);

export default router;
