/**
 * Govli AI FOIA Module - Role-Based Access Control
 * Permission management for FOIA users and roles
 */

export type Role =
  | 'ADMIN'           // Full system access
  | 'FOIA_OFFICER'    // Manage FOIA requests
  | 'REVIEWER'        // Review and approve responses
  | 'ANALYST'         // Analyze and triage requests
  | 'CLERK'           // Basic request processing
  | 'READ_ONLY';      // View-only access

export type Permission =
  // Request permissions
  | 'foia:request:create'
  | 'foia:request:read'
  | 'foia:request:update'
  | 'foia:request:delete'
  | 'foia:request:assign'
  | 'foia:request:close'

  // Response permissions
  | 'foia:response:draft'
  | 'foia:response:review'
  | 'foia:response:approve'
  | 'foia:response:send'

  // Document permissions
  | 'foia:document:upload'
  | 'foia:document:redact'
  | 'foia:document:download'
  | 'foia:document:delete'

  // AI feature permissions
  | 'foia:ai:scope-analyzer'
  | 'foia:ai:duplicate-detector'
  | 'foia:ai:auto-triage'
  | 'foia:ai:redaction-suggest'
  | 'foia:ai:all-features'

  // Analytics permissions
  | 'foia:analytics:view'
  | 'foia:analytics:export'

  // Admin permissions
  | 'foia:admin:users'
  | 'foia:admin:settings'
  | 'foia:admin:budget';

/**
 * Role-to-permissions mapping
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    'foia:request:create',
    'foia:request:read',
    'foia:request:update',
    'foia:request:delete',
    'foia:request:assign',
    'foia:request:close',
    'foia:response:draft',
    'foia:response:review',
    'foia:response:approve',
    'foia:response:send',
    'foia:document:upload',
    'foia:document:redact',
    'foia:document:download',
    'foia:document:delete',
    'foia:ai:all-features',
    'foia:analytics:view',
    'foia:analytics:export',
    'foia:admin:users',
    'foia:admin:settings',
    'foia:admin:budget'
  ],

  FOIA_OFFICER: [
    'foia:request:create',
    'foia:request:read',
    'foia:request:update',
    'foia:request:assign',
    'foia:request:close',
    'foia:response:draft',
    'foia:response:review',
    'foia:response:approve',
    'foia:response:send',
    'foia:document:upload',
    'foia:document:redact',
    'foia:document:download',
    'foia:ai:scope-analyzer',
    'foia:ai:duplicate-detector',
    'foia:ai:auto-triage',
    'foia:ai:redaction-suggest',
    'foia:analytics:view'
  ],

  REVIEWER: [
    'foia:request:read',
    'foia:request:update',
    'foia:response:review',
    'foia:response:approve',
    'foia:document:download',
    'foia:ai:scope-analyzer',
    'foia:ai:duplicate-detector',
    'foia:analytics:view'
  ],

  ANALYST: [
    'foia:request:read',
    'foia:request:update',
    'foia:response:draft',
    'foia:document:upload',
    'foia:document:download',
    'foia:ai:scope-analyzer',
    'foia:ai:duplicate-detector',
    'foia:ai:auto-triage',
    'foia:analytics:view'
  ],

  CLERK: [
    'foia:request:create',
    'foia:request:read',
    'foia:request:update',
    'foia:document:upload',
    'foia:document:download',
    'foia:ai:scope-analyzer',
    'foia:ai:duplicate-detector'
  ],

  READ_ONLY: [
    'foia:request:read',
    'foia:document:download',
    'foia:analytics:view'
  ]
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];

  // Admin has all permissions
  if (role === 'ADMIN') {
    return true;
  }

  // Check for AI all-features permission
  if (permission.startsWith('foia:ai:') &&
      permissions.includes('foia:ai:all-features')) {
    return true;
  }

  return permissions.includes(permission);
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role can access AI features
 */
export function canUseAIFeatures(role: Role): boolean {
  return hasPermission(role, 'foia:ai:all-features') ||
         hasAnyPermission(role, [
           'foia:ai:scope-analyzer',
           'foia:ai:duplicate-detector',
           'foia:ai:auto-triage',
           'foia:ai:redaction-suggest'
         ]);
}

/**
 * Check if a role can manage requests
 */
export function canManageRequests(role: Role): boolean {
  return hasAllPermissions(role, [
    'foia:request:create',
    'foia:request:update',
    'foia:request:assign'
  ]);
}

/**
 * Check if a role can approve responses
 */
export function canApproveResponses(role: Role): boolean {
  return hasPermission(role, 'foia:response:approve');
}

/**
 * Check if a role has admin privileges
 */
export function isAdmin(role: Role): boolean {
  return role === 'ADMIN';
}

/**
 * Require permission - throws error if not authorized
 */
export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Unauthorized: Role '${role}' lacks permission '${permission}'`);
  }
}

/**
 * Require any permission - throws error if not authorized
 */
export function requireAnyPermission(role: Role, permissions: Permission[]): void {
  if (!hasAnyPermission(role, permissions)) {
    throw new Error(
      `Unauthorized: Role '${role}' lacks any of: ${permissions.join(', ')}`
    );
  }
}

/**
 * Require all permissions - throws error if not authorized
 */
export function requireAllPermissions(role: Role, permissions: Permission[]): void {
  if (!hasAllPermissions(role, permissions)) {
    const missing = permissions.filter(p => !hasPermission(role, p));
    throw new Error(
      `Unauthorized: Role '${role}' lacks: ${missing.join(', ')}`
    );
  }
}

/**
 * Filter items based on read permission
 * Useful for filtering lists in APIs
 */
export function filterReadable<T extends { tenant_id: string }>(
  items: T[],
  role: Role,
  userTenantId: string
): T[] {
  if (!hasPermission(role, 'foia:request:read')) {
    return [];
  }

  // Admin can see all tenants
  if (role === 'ADMIN') {
    return items;
  }

  // Other roles can only see their tenant
  return items.filter(item => item.tenant_id === userTenantId);
}
