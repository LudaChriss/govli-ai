import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@govli/foia-ui';

export default function ResponseDraftPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Response Draft</h1>
          <p className="text-gray-600 mt-1">Request ID: {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/requests/${id}`)}>
          ← Back to Request
        </Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">✍️</div>
          <h2 className="text-2xl font-semibold text-gray-900">AI Response Drafting</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will provide an intelligent response drafting interface:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• AI-generated response letter drafts</li>
            <li>• Template selection and customization</li>
            <li>• Rich text editor with legal language suggestions</li>
            <li>• Automatic citation of applicable statutes and exemptions</li>
            <li>• Tone and compliance checking</li>
            <li>• Document attachment manager</li>
            <li>• Preview and send options</li>
            <li>• Version history and collaboration tools</li>
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
