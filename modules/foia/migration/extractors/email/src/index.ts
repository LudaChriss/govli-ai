// @govli/foia-migration-email
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * Email Import Engine Module
 *
 * Parses incoming FOIA requests from email using Claude Sonnet 4.5.
 * Agencies forward emails to import@{subdomain}.govli.ai for automatic processing.
 *
 * Webhook: POST /ingest (from SendGrid/AWS SES)
 * Admin Review: GET /pending, POST /:id/approve, POST /:id/reject
 * Analytics: GET /analytics
 */

import emailRouter from './routes';

export { emailRouter };

// Re-export types for external use
export type {
  AuthenticatedRequest,
  EmailAttachment,
  IncomingEmailPayload,
  ParsedFoiaRequest,
  EmailIngestResponse,
  PendingImportRequest,
  ApproveRequestInput,
  RejectRequestInput,
  EmailImportAnalytics,
  EmailImportStatus,
  EmailImportRecord
} from './types';

// Re-export utilities for programmatic use
export { parseEmailWithAI, extractTenantSubdomain, lookupTenantBySubdomain } from './utils/emailParser';
export { uploadAttachmentToS3, validateAttachment, getFileSizeFromBase64 } from './utils/attachmentHandler';
