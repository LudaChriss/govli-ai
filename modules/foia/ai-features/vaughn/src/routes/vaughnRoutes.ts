/**
 * AI-5: Vaughn Index Generator - API Routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { VaughnService } from '../services/vaughnService';
import { VaughnDocumentGenerator } from '../services/documentGenerator';
import {
  GenerateVaughnIndexInput,
  EditVaughnEntryInput,
  RegenerateVaughnIndexInput,
  VaughnDocumentOptions
} from '../types';

interface AuthRequest extends Request {
  auth?: {
    tenant_id: string;
    user_id: string;
    role: string;
  };
}

export function createVaughnRoutes(db: Pool): Router {
  const router = Router();
  const vaughnService = new VaughnService(db);
  const documentGenerator = new VaughnDocumentGenerator();

  // ============================================================================
  // AI-5: Vaughn Index Generation Endpoints
  // ============================================================================

  /**
   * POST /ai/vaughn/:foiaRequestId/generate
   * Generate a Vaughn Index for a FOIA request
   * Auth: foia_supervisor+ (typically legal counsel)
   */
  router.post('/:foiaRequestId/generate', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required for Vaughn Index generation' },
          timestamp: new Date()
        });
      }

      const { foiaRequestId } = req.params;
      const input: GenerateVaughnIndexInput = {
        foia_request_id: foiaRequestId,
        litigation_hold_id: req.body.litigation_hold_id,
        include_only_document_ids: req.body.include_only_document_ids
      };

      // Generate Vaughn Index
      const result = await vaughnService.generateVaughnIndex(
        req.auth.tenant_id,
        req.auth.user_id,
        input
      );

      // Generate PDF and DOCX documents
      const documentOptions: VaughnDocumentOptions = {
        include_cover_page: true,
        include_table_of_contents: true,
        include_declaration_page: true,
        agency_name: req.body.agency_name || 'Agency Name',
        agency_address: req.body.agency_address || '',
        court_name: req.body.court_name,
        case_number: req.body.case_number
      };

      const pdfPath = await documentGenerator.generatePDF(
        result.index,
        result.entries,
        documentOptions
      );

      const docxPath = await documentGenerator.generateDOCX(
        result.index,
        result.entries,
        documentOptions
      );

      // Update index with document paths
      await db.query(
        `UPDATE "FoiaVaughnIndexes"
         SET pdf_path = $1, docx_path = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [pdfPath, docxPath, result.index.id]
      );

      result.index.pdf_path = pdfPath;
      result.index.docx_path = docxPath;

      res.json({
        success: true,
        data: {
          index: result.index,
          entries: result.entries,
          generation_summary: {
            total_entries: result.entries.length,
            documents_processed: result.entries.length,
            generation_time_ms: result.index.generation_time_ms,
            model_used: result.index.model_used
          },
          download_urls: {
            pdf: `/api/ai/vaughn/${result.index.id}/download/pdf`,
            docx: `/api/ai/vaughn/${result.index.id}/download/docx`
          }
        },
        message: `Vaughn Index generated with ${result.entries.length} entries`,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Generate error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error.message || 'Failed to generate Vaughn Index'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/vaughn/:foiaRequestId/index
   * Get latest Vaughn Index for a FOIA request
   * Auth: foia_supervisor+
   */
  router.get('/:foiaRequestId/index', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const { foiaRequestId } = req.params;

      const result = await vaughnService.getVaughnIndexByRequest(
        req.auth.tenant_id,
        foiaRequestId
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No Vaughn Index found for this request' },
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        data: {
          index: result.index,
          entries: result.entries,
          download_urls: {
            pdf: result.index.pdf_path ? `/api/ai/vaughn/${result.index.id}/download/pdf` : null,
            docx: result.index.docx_path ? `/api/ai/vaughn/${result.index.id}/download/docx` : null
          }
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Get index error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch Vaughn Index'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * PUT /ai/vaughn/:foiaRequestId/entry/:entryId/edit
   * Edit a Vaughn Index entry
   * Auth: foia_supervisor+
   */
  router.put('/:foiaRequestId/entry/:entryId/edit', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required to edit entries' },
          timestamp: new Date()
        });
      }

      const { entryId } = req.params;
      const input: EditVaughnEntryInput = {
        entry_text: req.body.entry_text,
        edit_notes: req.body.edit_notes
      };

      if (!input.entry_text || input.entry_text.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Entry text is required (minimum 10 characters)'
          },
          timestamp: new Date()
        });
      }

      const entry = await vaughnService.editEntry(
        req.auth.tenant_id,
        entryId,
        req.auth.user_id,
        input
      );

      res.json({
        success: true,
        data: entry,
        message: 'Vaughn entry updated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Edit entry error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EDIT_FAILED',
          message: error.message || 'Failed to edit entry'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /ai/vaughn/:foiaRequestId/regenerate
   * Regenerate a Vaughn Index (creates new version, marks old as superseded)
   * Auth: foia_supervisor+
   */
  router.post('/:foiaRequestId/regenerate', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const { foiaRequestId } = req.params;

      // Get current index
      const current = await vaughnService.getVaughnIndexByRequest(
        req.auth.tenant_id,
        foiaRequestId
      );

      if (!current) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No existing Vaughn Index found to regenerate' },
          timestamp: new Date()
        });
      }

      const input: RegenerateVaughnIndexInput = {
        include_updated_entries: req.body.include_updated_entries !== false // Default true
      };

      // Regenerate index
      const result = await vaughnService.regenerateIndex(
        req.auth.tenant_id,
        req.auth.user_id,
        current.index.id,
        input
      );

      // Generate new PDF and DOCX
      const documentOptions: VaughnDocumentOptions = {
        include_cover_page: true,
        include_table_of_contents: true,
        include_declaration_page: true,
        agency_name: req.body.agency_name || 'Agency Name',
        agency_address: req.body.agency_address || '',
        court_name: req.body.court_name,
        case_number: req.body.case_number
      };

      const pdfPath = await documentGenerator.generatePDF(
        result.index,
        result.entries,
        documentOptions
      );

      const docxPath = await documentGenerator.generateDOCX(
        result.index,
        result.entries,
        documentOptions
      );

      // Update paths
      await db.query(
        `UPDATE "FoiaVaughnIndexes"
         SET pdf_path = $1, docx_path = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [pdfPath, docxPath, result.index.id]
      );

      result.index.pdf_path = pdfPath;
      result.index.docx_path = docxPath;

      res.json({
        success: true,
        data: {
          index: result.index,
          entries: result.entries,
          download_urls: {
            pdf: `/api/ai/vaughn/${result.index.id}/download/pdf`,
            docx: `/api/ai/vaughn/${result.index.id}/download/docx`
          }
        },
        message: 'Vaughn Index regenerated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Regenerate error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REGENERATE_FAILED',
          message: error.message || 'Failed to regenerate Vaughn Index'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/vaughn/:indexId/download/pdf
   * Download PDF version of Vaughn Index
   * Auth: foia_supervisor+
   */
  router.get('/:indexId/download/pdf', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { indexId } = req.params;

      const result = await vaughnService.getVaughnIndex(req.auth.tenant_id, indexId);

      if (!result || !result.index.pdf_path) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'PDF not found' }
        });
      }

      // In production, use res.download() to send file
      // For now, return file path
      res.json({
        success: true,
        data: {
          path: result.index.pdf_path,
          filename: `vaughn-index-${result.index.request_number}.pdf`
        }
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Download PDF error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DOWNLOAD_FAILED', message: error.message }
      });
    }
  });

  /**
   * GET /ai/vaughn/:indexId/download/docx
   * Download DOCX version of Vaughn Index
   * Auth: foia_supervisor+
   */
  router.get('/:indexId/download/docx', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { indexId } = req.params;

      const result = await vaughnService.getVaughnIndex(req.auth.tenant_id, indexId);

      if (!result || !result.index.docx_path) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'DOCX not found' }
        });
      }

      res.json({
        success: true,
        data: {
          path: result.index.docx_path,
          filename: `vaughn-index-${result.index.request_number}.docx`
        }
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Download DOCX error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DOWNLOAD_FAILED', message: error.message }
      });
    }
  });

  /**
   * POST /ai/vaughn/litigation-hold/:requestId
   * Place a litigation hold and prompt for Vaughn Index generation
   * Auth: foia_supervisor+
   */
  router.post('/litigation-hold/:requestId', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const { requestId } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Reason for litigation hold is required (minimum 10 characters)'
          },
          timestamp: new Date()
        });
      }

      // Create litigation hold
      const holdResult = await db.query(
        `INSERT INTO "FoiaLitigationHolds" (
          tenant_id,
          foia_request_id,
          reason,
          placed_by,
          placed_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING *`,
        [req.auth.tenant_id, requestId, reason, req.auth.user_id]
      );

      const hold = holdResult.rows[0];

      // Create Vaughn generation prompt
      await db.query(
        `INSERT INTO "FoiaVaughnGenerationPrompts" (
          tenant_id,
          foia_request_id,
          litigation_hold_id,
          prompt_shown_at,
          action_taken
        ) VALUES ($1, $2, $3, NOW(), 'PENDING')`,
        [req.auth.tenant_id, requestId, hold.id]
      );

      res.json({
        success: true,
        data: {
          hold,
          vaughn_prompt: {
            message: 'Would you like to generate a Vaughn Index now for this request?',
            generate_url: `/api/ai/vaughn/${requestId}/generate`,
            litigation_hold_id: hold.id
          }
        },
        message: 'Litigation hold placed successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[VaughnRoutes] Litigation hold error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HOLD_FAILED',
          message: error.message || 'Failed to place litigation hold'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
