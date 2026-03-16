/**
 * Email Import Engine - Routes
 */

import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

/**
 * POST /api/v1/foia/migration/email/ingest
 * Webhook for incoming emails from SendGrid/AWS SES
 *
 * Input: { from, to, subject, body_text, body_html, attachments[] }
 * Output: { processed, request_id?, confidence, requires_review, message }
 */
router.post('/ingest', handlers.ingestEmail);

/**
 * GET /api/v1/foia/migration/email/pending
 * List all PENDING_IMPORT_REVIEW requests from email import
 *
 * Auth: foia_admin
 * Output: { pending_requests[], total }
 */
router.get('/pending', handlers.getPendingReviews);

/**
 * POST /api/v1/foia/migration/email/:requestId/approve
 * Approve imported request and transition to SUBMITTED
 *
 * Auth: foia_admin
 * Input: { approved_fields: object }
 * Output: { request_id, status, message }
 */
router.post('/:requestId/approve', handlers.approveRequest);

/**
 * POST /api/v1/foia/migration/email/:requestId/reject
 * Reject and delete imported request
 *
 * Auth: foia_admin
 * Input: { reason: string }
 * Output: { message, reason }
 */
router.post('/:requestId/reject', handlers.rejectRequest);

/**
 * GET /api/v1/foia/migration/email/analytics
 * Get email import quality analytics
 *
 * Auth: foia_supervisor+
 * Output: { emails_received, parsed_as_foia, approved, rejected, avg_confidence, false_positive_rate }
 */
router.get('/analytics', handlers.getAnalytics);

export default router;
