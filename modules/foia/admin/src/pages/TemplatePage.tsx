import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function TemplatePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Response Templates</h1>
          <p className="text-gray-600 mt-1">Manage letter templates and automated responses</p>
        </div>
        <Button>Create New Template</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">📝</div>
          <h2 className="text-2xl font-semibold text-gray-900">Template Management</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will manage response letter templates and automated content:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Rich text template editor with merge fields</li>
            <li>• Pre-built templates for common response types</li>
            <li>• Exemption citation library and boilerplate</li>
            <li>• Multi-language template support</li>
            <li>• Template versioning and approval workflow</li>
            <li>• AI-powered template suggestions</li>
            <li>• Usage analytics by template</li>
            <li>• Jurisdiction-specific template variants</li>
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
