// @govli/foia-migration-spreadsheet
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * Spreadsheet Import Engine Module
 *
 * Provides AI-powered spreadsheet import for migrating FOIA data from Excel/CSV files.
 * Features column mapping suggestions using Claude Haiku 4.5.
 *
 * Supported formats: .xlsx, .csv, .tsv
 * Max file size: 50MB
 * Auth: foia_admin
 */

import spreadsheetRouter from './routes';

export { spreadsheetRouter };

// Re-export types for external use
export type {
  AuthenticatedRequest,
  FileUploadResponse,
  ColumnMapping,
  MappingSuggestionResponse,
  ConfirmMappingInput,
  ConfirmMappingResponse,
  ImportRequestInput,
  ImportResponse,
  ParsedSpreadsheetData,
  ConfirmedMapping,
  FoiaTargetField
} from './types';

// Re-export utilities for programmatic use
export {
  parseExcelFile,
  parseCsvFile,
  parseTsvFile,
  normalizeDate,
  normalizeStatus
} from './utils/fileParser';

export { suggestColumnMappings } from './utils/aiClient';
