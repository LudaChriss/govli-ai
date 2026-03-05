import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Badge } from '@govli/foia-ui';

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Request Detail</h1>
          <p className="text-gray-600 mt-1">Request ID: {id}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/requests')}>
          ← Back to List
        </Button>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl">📋</div>
          <h2 className="text-2xl font-semibold text-gray-900">Request Detail View</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            This page will display comprehensive details about FOIA request {id}, including:
          </p>
          <ul className="text-left max-w-xl mx-auto space-y-2 text-gray-700">
            <li>• Requester information and contact details</li>
            <li>• Request description and scope</li>
            <li>• Status history and timeline</li>
            <li>• Assigned officer and department</li>
            <li>• Document inventory and attachments</li>
            <li>• AI analysis and recommendations</li>
            <li>• Activity log and notes</li>
            <li>• Quick actions (redaction, response drafting, routing)</li>
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
