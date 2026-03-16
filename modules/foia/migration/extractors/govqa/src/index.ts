// @govli/foia-migration-govqa
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * GovQA Data Extractor Module
 *
 * CLI tool for extracting and migrating data from GovQA to Govli.
 * Run with: npx govli-migrate-govqa
 *
 * Features:
 * - Interactive CLI with step-by-step guidance
 * - Paginated extraction from GovQA API
 * - Field mapping and transformation
 * - Batch loading to Govli Migration API
 * - Validation and HTML reporting
 * - Checkpoint resume for interrupted migrations
 */

export { GovQAClient } from './govqaClient';
export { GovQAExtractor } from './extractor';
export { GovQATransformer } from './transformer';
export { GovliLoader } from './loader';
export { MigrationValidator } from './validator';

export type {
  GovQAConfig,
  GovliConfig,
  MigrationConfig,
  GovQACase,
  GovQAContact,
  GovQADocument,
  GovQACommunication,
  GovQAFee,
  GovQARoutingRule,
  ExtractionCheckpoint,
  ExtractionSummary,
  TransformationResult,
  LoadingResult,
  ValidationReport,
  GovliMigrationContact,
  GovliMigrationRequest,
  GovliMigrationDocument,
  GovliMigrationCommunication,
  GovliMigrationFee
} from './types';
