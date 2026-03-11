/**
 * AI-2: Autonomous Document Triage - Event Handlers
 * Automatic triage triggers on document upload events
 */

import { Pool } from 'pg';
import { TriageService } from '../services/triageService';

export interface DocumentEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_id: string; // document_id or foia_request_id
  entity_type: string;
  user_id?: string;
  metadata?: any;
  timestamp: Date;
}

/**
 * Handle document upload events and trigger automatic triage
 */
export async function handleDocumentPackageReady(
  event: DocumentEvent,
  db: Pool
): Promise<void> {
  console.log('[TriageEventHandler] Received foia.document.package.ready event:', event.id);

  const triageService = new TriageService(db);
  const foia_request_id = event.entity_id;

  try {
    // Automatically run triage on all PENDING_REVIEW documents
    await triageService.runTriageForRequest(
      event.tenant_id,
      foia_request_id,
      event.user_id || 'system',
      undefined, // No specific document IDs - triage all untriaged docs
      false // Don't force retriage
    );

    console.log(`[TriageEventHandler] Auto-triage completed for request ${foia_request_id}`);
  } catch (error: any) {
    console.error(`[TriageEventHandler] Auto-triage failed for request ${foia_request_id}:`, error.message);
    // Don't throw - we don't want to break the event bus
  }
}

/**
 * Handle individual document upload events
 */
export async function handleDocumentUploaded(
  event: DocumentEvent,
  db: Pool
): Promise<void> {
  console.log('[TriageEventHandler] Received foia.document.uploaded event:', event.id);

  const triageService = new TriageService(db);
  const document_id = event.entity_id;

  // Get the FOIA request ID from the document
  const result = await db.query(
    `SELECT foia_request_id, tenant_id FROM "FoiaDocuments" WHERE id = $1`,
    [document_id]
  );

  if (result.rows.length === 0) {
    console.error(`[TriageEventHandler] Document ${document_id} not found`);
    return;
  }

  const { foia_request_id, tenant_id } = result.rows[0];

  try {
    // Run triage on this specific document
    await triageService.runTriageForRequest(
      tenant_id,
      foia_request_id,
      event.user_id || 'system',
      [document_id], // Specific document ID
      false
    );

    console.log(`[TriageEventHandler] Auto-triage completed for document ${document_id}`);
  } catch (error: any) {
    console.error(`[TriageEventHandler] Auto-triage failed for document ${document_id}:`, error.message);
  }
}

/**
 * Register event handlers
 */
export function registerTriageEventHandlers(eventBus: any, db: Pool): void {
  // Auto-trigger triage when document package is ready
  eventBus.on('foia.document.package.ready', async (event: DocumentEvent) => {
    await handleDocumentPackageReady(event, db);
  });

  // Auto-trigger triage when individual document is uploaded
  eventBus.on('foia.document.uploaded', async (event: DocumentEvent) => {
    await handleDocumentUploaded(event, db);
  });

  console.log('[TriageEventHandler] Event handlers registered');
}
