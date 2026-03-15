-- Migration: Migration API Tables
-- Description: Creates tables for FOIA data migration from legacy systems
-- Date: 2026-03-15

-- =====================================================
-- Table: FoiaMigrationConfigurations
-- Purpose: Stores migration configuration and authentication keys
-- =====================================================
CREATE TABLE IF NOT EXISTS "FoiaMigrationConfigurations" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  migration_source VARCHAR(50) NOT NULL,
  migration_key VARCHAR(255) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  migration_window_expires_at TIMESTAMP NOT NULL,
  finalized_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for tenant lookups
CREATE INDEX idx_migration_configs_tenant
  ON "FoiaMigrationConfigurations"(tenant_id);

-- Index for active migrations
CREATE INDEX idx_migration_configs_active
  ON "FoiaMigrationConfigurations"(is_active, migration_window_expires_at)
  WHERE is_active = true;

-- Unique constraint on tenant + source
CREATE UNIQUE INDEX idx_migration_configs_tenant_source
  ON "FoiaMigrationConfigurations"(tenant_id, migration_source);

COMMENT ON TABLE "FoiaMigrationConfigurations" IS
  'Stores migration configuration for tenant data migration from legacy FOIA systems';
COMMENT ON COLUMN "FoiaMigrationConfigurations".migration_key IS
  'Secret key used to authenticate migration API requests (generate secure random value)';
COMMENT ON COLUMN "FoiaMigrationConfigurations".migration_window_expires_at IS
  'Expiry date for migration window (typically 60 days from onboarding)';

-- =====================================================
-- Table: FoiaMigrationRecords
-- Purpose: Tracks individual migrated FOIA requests
-- =====================================================
CREATE TABLE IF NOT EXISTS "FoiaMigrationRecords" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  migration_source VARCHAR(20) NOT NULL,
  legacy_id VARCHAR(100) NOT NULL,
  legacy_status VARCHAR(50) NOT NULL,
  govli_request_id UUID NOT NULL,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'MIGRATED',
  migrated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: prevent duplicate imports of same legacy record
CREATE UNIQUE INDEX idx_migration_records_unique_legacy
  ON "FoiaMigrationRecords"(tenant_id, migration_source, legacy_id);

-- Index for Govli request lookups (used in document/audit imports)
CREATE INDEX idx_migration_records_govli_request
  ON "FoiaMigrationRecords"(govli_request_id);

-- Index for tenant queries
CREATE INDEX idx_migration_records_tenant
  ON "FoiaMigrationRecords"(tenant_id, migration_source);

-- Index for validation status queries
CREATE INDEX idx_migration_records_validation
  ON "FoiaMigrationRecords"(tenant_id, validation_status);

-- Foreign key to FoiaRequests (if exists)
-- Note: This assumes FoiaRequests table exists from previous migrations
ALTER TABLE "FoiaMigrationRecords"
  ADD CONSTRAINT fk_migration_records_govli_request
  FOREIGN KEY (govli_request_id) REFERENCES "FoiaRequests"(id)
  ON DELETE CASCADE;

COMMENT ON TABLE "FoiaMigrationRecords" IS
  'Tracks mapping between legacy system request IDs and Govli request IDs';
COMMENT ON COLUMN "FoiaMigrationRecords".legacy_id IS
  'Original request ID from legacy FOIA system';
COMMENT ON COLUMN "FoiaMigrationRecords".validation_status IS
  'Migration validation status: MIGRATED, VALIDATED, FINAL';

-- =====================================================
-- Table: FoiaMigrationStatusMappings
-- Purpose: Custom status mappings from legacy to Govli statuses
-- =====================================================
CREATE TABLE IF NOT EXISTS "FoiaMigrationStatusMappings" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  migration_source VARCHAR(50) NOT NULL,
  legacy_status VARCHAR(100) NOT NULL,
  govli_status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: one mapping per legacy status per tenant/source
CREATE UNIQUE INDEX idx_migration_status_mapping_unique
  ON "FoiaMigrationStatusMappings"(tenant_id, migration_source, legacy_status);

-- Index for tenant lookups
CREATE INDEX idx_migration_status_mapping_tenant
  ON "FoiaMigrationStatusMappings"(tenant_id, migration_source);

COMMENT ON TABLE "FoiaMigrationStatusMappings" IS
  'Custom status code mappings from legacy FOIA systems to Govli statuses';
COMMENT ON COLUMN "FoiaMigrationStatusMappings".legacy_status IS
  'Status code from legacy system (e.g., "NEW", "ASSIGNED" from GovQA)';
COMMENT ON COLUMN "FoiaMigrationStatusMappings".govli_status IS
  'Corresponding Govli FOIA status (e.g., SUBMITTED, IN_PROGRESS, CLOSED)';

-- =====================================================
-- View: Migration Progress Summary
-- Purpose: Quick overview of migration status per tenant
-- =====================================================
CREATE OR REPLACE VIEW "MigrationProgressSummary" AS
SELECT
  mr.tenant_id,
  mr.migration_source,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE mr.validation_status = 'MIGRATED') as migrated_count,
  COUNT(*) FILTER (WHERE mr.validation_status = 'VALIDATED') as validated_count,
  COUNT(*) FILTER (WHERE mr.validation_status = 'FINAL') as finalized_count,
  MIN(mr.migrated_at) as first_migration,
  MAX(mr.migrated_at) as last_migration,
  MAX(mr.finalized_at) as finalized_at,
  mc.is_active as migration_active,
  mc.migration_window_expires_at
FROM "FoiaMigrationRecords" mr
LEFT JOIN "FoiaMigrationConfigurations" mc
  ON mr.tenant_id = mc.tenant_id
  AND mr.migration_source = mc.migration_source
GROUP BY
  mr.tenant_id,
  mr.migration_source,
  mc.is_active,
  mc.migration_window_expires_at;

COMMENT ON VIEW "MigrationProgressSummary" IS
  'Summary view of migration progress for each tenant and source system';

-- =====================================================
-- Function: Get Legacy Request ID from Govli ID
-- Purpose: Reverse lookup for troubleshooting
-- =====================================================
CREATE OR REPLACE FUNCTION get_legacy_request_id(
  p_govli_request_id UUID
) RETURNS TABLE(
  legacy_id VARCHAR(100),
  migration_source VARCHAR(20),
  legacy_status VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.legacy_id,
    mr.migration_source,
    mr.legacy_status
  FROM "FoiaMigrationRecords" mr
  WHERE mr.govli_request_id = p_govli_request_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_legacy_request_id IS
  'Reverse lookup to find legacy request ID from Govli request ID';

-- =====================================================
-- Grants (adjust based on your role structure)
-- =====================================================
-- Grant read access to foia_admin role
GRANT SELECT ON "FoiaMigrationConfigurations" TO foia_admin;
GRANT SELECT ON "FoiaMigrationRecords" TO foia_admin;
GRANT SELECT ON "FoiaMigrationStatusMappings" TO foia_admin;
GRANT SELECT ON "MigrationProgressSummary" TO foia_admin;

-- Grant write access to migration_api role (used by migration API service)
GRANT SELECT, INSERT, UPDATE ON "FoiaMigrationConfigurations" TO migration_api;
GRANT SELECT, INSERT, UPDATE ON "FoiaMigrationRecords" TO migration_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FoiaMigrationStatusMappings" TO migration_api;
GRANT SELECT ON "MigrationProgressSummary" TO migration_api;
GRANT EXECUTE ON FUNCTION get_legacy_request_id TO migration_api;
