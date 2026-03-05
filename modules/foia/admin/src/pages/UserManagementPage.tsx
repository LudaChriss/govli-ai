import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function UserManagementPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-1">Manage users, roles, and permissions</p>
        </div>
        <Button>Invite New User</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">👥</div>
          <h2 className="text-2xl font-semibold text-gray-900">User & Role Management</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will manage users, roles, and access control:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• User directory with active/inactive status</li>
            <li>• Role-based access control (RBAC)</li>
            <li>• Department and team assignment</li>
            <li>• Granular permission management</li>
            <li>• Single sign-on (SSO) integration</li>
            <li>• Activity logs and audit trails per user</li>
            <li>• Workload capacity and availability tracking</li>
            <li>• Training status and certification tracking</li>
          </ul>
          <div className="pt-4 flex gap-3 justify-center">
            <Badge variant="info">Coming Soon</Badge>
            <Badge variant="default">Phase 2</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}
