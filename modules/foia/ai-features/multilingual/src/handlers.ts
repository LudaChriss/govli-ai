/**
 * Govli AI FOIA Module - Multilingual Processing Handlers
 * AI-10: API endpoints for translation services
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { TranslationService, SUPPORTED_LANGUAGES } from './services/translationService';

// Database connection pool
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const TranslateRequestIntakeSchema = z.object({
  foia_request_id: z.string().uuid(),
  description: z.string().min(1),
  source_language: z.string().optional(),
  target_language: z.string().default('en')
});

const TranslateCommunicationSchema = z.object({
  foia_request_id: z.string().uuid(),
  communication_text: z.string().min(1),
  target_language: z.string().min(2),
  communication_type: z.enum(['acknowledgment', 'status_update', 'clarification', 'response', 'other'])
});

const TranslateDocumentSchema = z.object({
  source_language: z.string().optional(),
  target_language: z.string().default('en')
});

type TranslateRequestIntakeInput = z.infer<typeof TranslateRequestIntakeSchema>;
type TranslateCommunicationInput = z.infer<typeof TranslateCommunicationSchema>;
type TranslateDocumentInput = z.infer<typeof TranslateDocumentSchema>;

// ============================================================================
// Handler: Translate Request Intake
// ============================================================================

/**
 * POST /ai/translate/request-intake
 *
 * Translate incoming FOIA request description to English for staff processing
 */
export async function translateRequestIntake(
  req: Request<{}, {}, TranslateRequestIntakeInput>,
  res: Response
): Promise<void> {
  try {
    const validation = TranslateRequestIntakeSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { foia_request_id, description, source_language, target_language } = validation.data;

    // Get tenant ID from request (set by auth middleware)
    const tenantId = (req as any).tenantId || 'default';

    const translationService = new TranslationService(tenantId);

    // Translate the request description
    const result = await translationService.translateRequest(
      description,
      source_language,
      target_language
    );

    // Store translation in database
    await dbPool.query(
      `INSERT INTO "FoiaTranslations"
       (foia_request_id, translation_type, source_language, target_language,
        original_text, translated_text, confidence, needs_professional_review, translation_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        foia_request_id,
        'REQUEST_INTAKE',
        result.source_language,
        result.target_language,
        description,
        result.translated_text,
        result.confidence,
        result.needs_professional_review,
        result.translation_notes
      ]
    );

    // Update request with translation info
    await dbPool.query(
      `UPDATE "FoiaRequests"
       SET original_language = $1,
           translation_available = true,
           updated_at = NOW()
       WHERE id = $2`,
      [result.source_language, foia_request_id]
    );

    res.json({
      success: true,
      data: {
        translated_text: result.translated_text,
        source_language: result.source_language,
        target_language: result.target_language,
        confidence: result.confidence,
        needs_professional_review: result.needs_professional_review,
        translation_notes: result.translation_notes
      }
    });

  } catch (error) {
    console.error('Error translating request intake:', error);
    res.status(500).json({
      success: false,
      error: 'Translation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Translate Communication
// ============================================================================

/**
 * POST /ai/translate/communication
 *
 * Translate outgoing communication to requester's preferred language
 */
export async function translateCommunication(
  req: Request<{}, {}, TranslateCommunicationInput>,
  res: Response
): Promise<void> {
  try {
    const validation = TranslateCommunicationSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const {
      foia_request_id,
      communication_text,
      target_language,
      communication_type
    } = validation.data;

    // Validate target language is supported
    if (!Object.keys(SUPPORTED_LANGUAGES).includes(target_language)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported language',
        message: `Language '${target_language}' is not supported. Supported languages: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`
      });
      return;
    }

    const tenantId = (req as any).tenantId || 'default';
    const translationService = new TranslationService(tenantId);

    // Translate the communication
    const result = await translationService.translateCommunication(
      communication_text,
      target_language,
      communication_type
    );

    // Store translation in database
    const translationResult = await dbPool.query(
      `INSERT INTO "FoiaTranslations"
       (foia_request_id, translation_type, source_language, target_language,
        original_text, translated_text, confidence, needs_professional_review,
        translation_notes, communication_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        foia_request_id,
        'COMMUNICATION',
        result.source_language,
        result.target_language,
        communication_text,
        result.translated_text,
        result.confidence,
        result.needs_professional_review,
        result.translation_notes,
        communication_type
      ]
    );

    res.json({
      success: true,
      data: {
        translation_id: translationResult.rows[0].id,
        translated_text: result.translated_text,
        source_language: result.source_language,
        target_language: result.target_language,
        confidence: result.confidence,
        needs_professional_review: result.needs_professional_review,
        translation_notes: result.translation_notes
      }
    });

  } catch (error) {
    console.error('Error translating communication:', error);
    res.status(500).json({
      success: false,
      error: 'Translation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Translate Document
// ============================================================================

/**
 * POST /ai/translate/document/:documentId
 *
 * Translate document content (with chunking for large documents)
 */
export async function translateDocument(
  req: Request<{ documentId: string }, {}, TranslateDocumentInput>,
  res: Response
): Promise<void> {
  try {
    const { documentId } = req.params;

    const validation = TranslateDocumentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { source_language, target_language } = validation.data;

    // Fetch document from database
    const documentResult = await dbPool.query(
      `SELECT d.*, r.id as request_id
       FROM "FoiaDocuments" d
       JOIN "FoiaRequests" r ON d.request_id = r.id
       WHERE d.id = $1`,
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Document not found'
      });
      return;
    }

    const document = documentResult.rows[0];

    // For this implementation, we'll assume document content is in a 'content' field
    // In production, you might fetch from file storage instead
    const documentContent = document.content || document.redaction_summary || '';

    if (!documentContent) {
      res.status(400).json({
        success: false,
        error: 'Document has no translatable content'
      });
      return;
    }

    const tenantId = (req as any).tenantId || 'default';
    const translationService = new TranslationService(tenantId);

    // Translate the document (with automatic chunking)
    const result = await translationService.translateDocument(
      documentContent,
      source_language,
      target_language
    );

    // Store translation in database
    const translationResult = await dbPool.query(
      `INSERT INTO "FoiaTranslations"
       (foia_request_id, translation_type, source_language, target_language,
        original_text, translated_text, confidence, needs_professional_review,
        translation_notes, document_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        document.request_id,
        'DOCUMENT',
        result.source_language,
        result.target_language,
        documentContent,
        result.translated_text,
        result.confidence,
        result.needs_professional_review,
        result.translation_notes,
        documentId
      ]
    );

    res.json({
      success: true,
      data: {
        translation_id: translationResult.rows[0].id,
        document_id: documentId,
        translated_text: result.translated_text,
        source_language: result.source_language,
        target_language: result.target_language,
        confidence: result.confidence,
        needs_professional_review: result.needs_professional_review,
        translation_notes: result.translation_notes
      }
    });

  } catch (error) {
    console.error('Error translating document:', error);
    res.status(500).json({
      success: false,
      error: 'Translation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Get Supported Languages
// ============================================================================

/**
 * GET /ai/translate/languages
 *
 * Get list of supported languages
 */
export async function getSupportedLanguages(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const languages = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
      code,
      name
    }));

    res.json({
      success: true,
      data: {
        languages,
        total: languages.length
      }
    });

  } catch (error) {
    console.error('Error fetching supported languages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch languages'
    });
  }
}

// ============================================================================
// Handler: Get Translation History
// ============================================================================

/**
 * GET /ai/translate/history/:foiaRequestId
 *
 * Get translation history for a FOIA request
 */
export async function getTranslationHistory(
  req: Request<{ foiaRequestId: string }>,
  res: Response
): Promise<void> {
  try {
    const { foiaRequestId } = req.params;

    const result = await dbPool.query(
      `SELECT
         id,
         translation_type,
         source_language,
         target_language,
         confidence,
         needs_professional_review,
         translation_notes,
         communication_type,
         document_id,
         created_at
       FROM "FoiaTranslations"
       WHERE foia_request_id = $1
       ORDER BY created_at DESC`,
      [foiaRequestId]
    );

    res.json({
      success: true,
      data: {
        translations: result.rows,
        total: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching translation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch translation history'
    });
  }
}
