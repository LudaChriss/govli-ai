import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@govli/foia-ui';

export default function ConsistencyCheckPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Consistency Check</h1>
          <p className="text-gray-600 mt-1">Request ID: {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/requests/${id}`)}>
          ← Back to Request
        </Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">🔍</div>
          <h2 className="text-2xl font-semibold text-gray-900">AI Consistency Checker</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will analyze responses for consistency with previous decisions:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Compare current response with historical similar requests</li>
            <li>• Flag potential inconsistencies in redactions or exemptions</li>
            <li>• Display side-by-side comparison of similar documents</li>
            <li>• AI-powered similarity scoring</li>
            <li>• Exemption usage analysis</li>
            <li>• Recommendations for alignment with precedents</li>
            <li>• Justification documentation for deviations</li>
            <li>• Export consistency report</li>
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
