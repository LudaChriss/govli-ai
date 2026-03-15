/**
 * Migration API - Status Mapping Utilities
 */

import { Pool } from 'pg';
import { StatusMapping, DEFAULT_STATUS_MAPPINGS } from '../types';

/**
 * Get status mapping for a tenant
 */
export async function getStatusMapping(
  db: Pool,
  tenantId: string,
  migrationSource: string
): Promise<Map<string, string>> {
  // Try to get custom mappings from database
  const result = await db.query(
    `SELECT legacy_status, govli_status
     FROM "FoiaMigrationStatusMappings"
     WHERE tenant_id = $1 AND migration_source = $2`,
    [tenantId, migrationSource]
  );

  if (result.rows.length > 0) {
    // Use custom mappings
    const mappingMap = new Map<string, string>();
    result.rows.forEach((row: any) => {
      mappingMap.set(row.legacy_status, row.govli_status);
    });
    return mappingMap;
  }

  // Use default mappings for the migration source
  const defaultMappings = DEFAULT_STATUS_MAPPINGS[migrationSource] || [];
  const mappingMap = new Map<string, string>();
  defaultMappings.forEach((mapping: StatusMapping) => {
    mappingMap.set(mapping.legacy_status, mapping.govli_status);
  });

  return mappingMap;
}

/**
 * Store custom status mappings for a tenant
 */
export async function storeStatusMappings(
  db: Pool,
  tenantId: string,
  migrationSource: string,
  mappings: StatusMapping[]
): Promise<void> {
  // Delete existing mappings
  await db.query(
    `DELETE FROM "FoiaMigrationStatusMappings"
     WHERE tenant_id = $1 AND migration_source = $2`,
    [tenantId, migrationSource]
  );

  // Insert new mappings
  for (const mapping of mappings) {
    await db.query(
      `INSERT INTO "FoiaMigrationStatusMappings"
       (id, tenant_id, migration_source, legacy_status, govli_status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
      [tenantId, migrationSource, mapping.legacy_status, mapping.govli_status]
    );
  }
}

/**
 * Map legacy status to Govli status
 */
export function mapStatus(
  legacyStatus: string,
  statusMap: Map<string, string>
): string {
  return statusMap.get(legacyStatus) || 'SUBMITTED'; // Default to SUBMITTED if not found
}
