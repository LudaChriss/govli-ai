-- Govli AI FOIA Module: Add unique constraints for patterns and proactive candidates
-- Migration 011: Unique constraints to prevent duplicate clusters and candidates

-- Add unique constraint to FoiaRequestPatterns
-- Ensures one cluster per tenant with unique name
ALTER TABLE "FoiaRequestPatterns"
  ADD CONSTRAINT "FoiaRequestPatterns_tenant_cluster_unique"
  UNIQUE (tenant_id, cluster_name);

-- Add unique constraint to FoiaProactiveCandidates
-- Ensures one candidate per tenant per cluster name
ALTER TABLE "FoiaProactiveCandidates"
  ADD CONSTRAINT "FoiaProactiveCandidates_tenant_cluster_unique"
  UNIQUE (tenant_id, cluster_name);

-- Add unique constraint to FoiaRepeatRequesters
-- Ensures one record per requester email per tenant
ALTER TABLE "FoiaRepeatRequesters"
  ADD CONSTRAINT "FoiaRepeatRequesters_tenant_email_unique"
  UNIQUE (tenant_id, requester_email);

COMMENT ON CONSTRAINT "FoiaRequestPatterns_tenant_cluster_unique"
  ON "FoiaRequestPatterns"
  IS 'Ensures one cluster per tenant with unique name';

COMMENT ON CONSTRAINT "FoiaProactiveCandidates_tenant_cluster_unique"
  ON "FoiaProactiveCandidates"
  IS 'Ensures one candidate per tenant per cluster name';

COMMENT ON CONSTRAINT "FoiaRepeatRequesters_tenant_email_unique"
  ON "FoiaRepeatRequesters"
  IS 'Ensures one record per requester email per tenant';
