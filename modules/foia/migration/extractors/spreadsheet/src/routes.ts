/**
 * Spreadsheet Import Engine - Routes
 */

import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

/**
 * POST /api/v1/foia/migration/spreadsheet/upload
 * Upload and parse spreadsheet file (.xlsx, .csv, .tsv)
 *
 * Auth: foia_admin
 * Input: multipart/form-data with file (max 50MB)
 * Output: { file_id, sheet_names, columns, row_count, preview, detected_date_columns, detected_email_columns }
 */
router.post(
  '/upload',
  handlers.upload.single('file'),
  handlers.uploadSpreadsheet
);

/**
 * POST /api/v1/foia/migration/spreadsheet/suggest-mapping
 * Get AI-suggested column mappings
 *
 * Auth: foia_admin
 * Input: { file_id: string, sheet_name?: string }
 * Output: { mappings: { source_column, target_field, confidence }[] }
 */
router.post('/suggest-mapping', handlers.suggestMapping);

/**
 * POST /api/v1/foia/migration/spreadsheet/confirm-mapping
 * Confirm or adjust column mappings
 *
 * Auth: foia_admin
 * Input: { file_id: string, mappings: { source, target }[] }
 * Output: { mapping_id, mapped_fields, unmapped_columns }
 */
router.post('/confirm-mapping', handlers.confirmMapping);

/**
 * POST /api/v1/foia/migration/spreadsheet/import
 * Import spreadsheet data into FOIA requests
 *
 * Auth: foia_admin
 * Input: { file_id: string, mapping_id: string }
 * Output: { total_rows, imported, skipped, errors[], import_report_url }
 */
router.post('/import', handlers.importSpreadsheet);

export default router;
