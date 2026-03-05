import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@govli/foia-ui';

export default function VaughnIndexPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vaughn Index Generator</h1>
          <p className="text-gray-600 mt-1">Request ID: {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/requests/${id}`)}>
          ← Back to Request
        </Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">📊</div>
          <h2 className="text-2xl font-semibold text-gray-900">Automated Vaughn Index Creation</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will generate and manage Vaughn indices for withheld documents:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• AI-generated Vaughn index entries</li>
            <li>• Document-by-document itemization</li>
            <li>• Automatic exemption citation and justification</li>
            <li>• Editable table interface</li>
            <li>• Compliance with court requirements</li>
            <li>• Export to PDF and Word formats</li>
            <li>• Version control and approval workflow</li>
            <li>• Template customization by jurisdiction</li>
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
