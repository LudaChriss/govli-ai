import React from 'react';
import { Card, Badge, Button } from '@govli/foia-ui';

export default function BrandingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Branding & Customization</h1>
          <p className="text-gray-600 mt-1">Customize the look and feel for your agency</p>
        </div>
        <Button>Preview Changes</Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🎨</div>
          <h2 className="text-2xl font-semibold text-gray-900">White-Label Customization</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will customize branding and appearance:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Agency logo and favicon upload</li>
            <li>• Color scheme customization (primary, secondary, accent)</li>
            <li>• Custom domain configuration</li>
            <li>• Email template branding</li>
            <li>• Portal header and footer customization</li>
            <li>• Font and typography settings</li>
            <li>• Custom CSS for advanced styling</li>
            <li>• Multi-language portal support</li>
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
