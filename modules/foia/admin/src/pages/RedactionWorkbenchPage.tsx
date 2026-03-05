import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@govli/foia-ui';

export default function RedactionWorkbenchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Redaction Workbench</h1>
          <p className="text-gray-600 mt-1">Request ID: {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/requests/${id}`)}>
          ← Back to Request
        </Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🖍️</div>
          <h2 className="text-2xl font-semibold text-gray-900">AI-Powered Redaction Workbench</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will provide a comprehensive redaction interface with AI assistance:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• PDF document viewer with annotation tools</li>
            <li>• AI-suggested redactions with exemption citations</li>
            <li>• Manual redaction drawing and text selection</li>
            <li>• Exemption code selector (b)(1)-(9)</li>
            <li>• Side-by-side original and redacted view</li>
            <li>• Redaction log and justification notes</li>
            <li>• Export to redacted PDF</li>
            <li>• Consistency checks across similar documents</li>
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
