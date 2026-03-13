# AI-4 Exemption Consistency Analyzer - Integration Guide

This guide walks you through integrating the Exemption Consistency Analyzer into your FOIA application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Backend Integration](#backend-integration)
4. [Frontend Integration](#frontend-integration)
5. [Testing Integration](#testing-integration)
6. [Production Deployment](#production-deployment)

---

## Prerequisites

Before integrating AI-4, ensure you have:

- ✅ A-4 Response Approval workflow implemented
- ✅ `@govli/foia-shared` package with AI client configured
- ✅ PostgreSQL database with FOIA tables
- ✅ Authentication middleware providing `req.auth` with `tenant_id`, `user_id`, `role`
- ✅ Express.js backend with TypeScript

---

## Database Setup

### Step 1: Run Migration

Apply the consistency checks migration:

```bash
psql -d your_database_name -f modules/foia/migrations/012_consistency_checks.sql
```

### Step 2: Verify Tables

Check that the tables were created:

```sql
-- Should show FoiaConsistencyChecks and FoiaConsistencyReports
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'FoiaConsistency%';
```

### Step 3: Grant Permissions

Ensure your application user has the necessary permissions:

```sql
GRANT SELECT, INSERT, UPDATE ON "FoiaConsistencyChecks" TO your_app_user;
GRANT SELECT, INSERT, UPDATE ON "FoiaConsistencyReports" TO your_app_user;
```

---

## Backend Integration

### Step 1: Add Consistency Routes

In your main FOIA API router:

```typescript
// src/api/foia/index.ts
import { createConsistencyRoutes } from '../ai-features/consistency/src/routes/consistencyRoutes';

export function createFoiaRouter(db: Pool): Router {
  const router = Router();

  // ... existing routes ...

  // AI-4: Consistency routes
  router.use('/ai/consistency', createConsistencyRoutes(db));

  return router;
}
```

### Step 2: Add Middleware to Approval Endpoint

Integrate the consistency check middleware into your response approval workflow:

```typescript
// src/api/foia/responses.ts
import { Router } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../../middleware/auth';
import { consistencyCheckMiddleware } from '../ai-features/consistency/src/middleware/consistencyMiddleware';

export function createResponseRoutes(db: Pool): Router {
  const router = Router();

  /**
   * POST /responses/:id/approve
   * Approve a FOIA response (with consistency check)
   */
  router.post('/:id/approve',
    authMiddleware, // Your existing auth middleware
    consistencyCheckMiddleware(db, {
      requireAcknowledgmentForMedium: true,
      autoPassLowRisk: true,
      skipForRoles: ['system'] // Skip consistency check for automated approvals
    }),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { tenant_id, user_id } = req.auth!;

        // Consistency check passed - access results if needed
        const consistencyCheck = req.consistencyCheck;
        if (consistencyCheck) {
          console.log(`Consistency check passed with ${consistencyCheck.overall_risk} risk`);
        }

        // Proceed with your existing approval logic
        const result = await db.query(
          `UPDATE "FoiaResponses"
           SET status = 'approved',
               approved_by = $2,
               approved_at = NOW()
           WHERE id = $1 AND tenant_id = $3
           RETURNING *`,
          [id, user_id, tenant_id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Response not found' }
          });
        }

        res.json({
          success: true,
          data: result.rows[0],
          message: 'Response approved successfully'
        });
      } catch (error: any) {
        console.error('[ResponseRoutes] Approval error:', error);
        res.status(500).json({
          success: false,
          error: { code: 'APPROVAL_FAILED', message: error.message }
        });
      }
    }
  );

  return router;
}
```

### Step 3: Set Up Monthly Report Cron

Add the monthly report cron job to your worker process:

```typescript
// src/workers/index.ts
import { Pool } from 'pg';
import { MonthlyConsistencyReportCron } from '../ai-features/consistency/workers/monthly-consistency-report-cron';

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function startWorkers() {
  console.log('[Workers] Starting background workers...');

  // ... your existing workers ...

  // AI-4: Monthly Consistency Report
  const consistencyReportCron = new MonthlyConsistencyReportCron(db, {
    schedule: '0 6 1 * *', // 6am on 1st of month
    runOnStartup: false,
    notifySupervisors: true,
    timezone: process.env.TZ || 'America/New_York'
  });

  await consistencyReportCron.start();
  console.log('[Workers] Monthly consistency report cron started');
}

startWorkers().catch(console.error);
```

---

## Frontend Integration

### Step 1: Handle MEDIUM Risk Warnings

When a MEDIUM risk inconsistency is detected, show a warning dialog:

```typescript
// components/ResponseApprovalDialog.tsx
import React, { useState } from 'react';

interface ConsistencyAlert {
  alert_type: string;
  exemption_code: string;
  severity: string;
  explanation: string;
  suggested_action: string;
}

export function ResponseApprovalDialog({ responseId, onApprove, onCancel }) {
  const [mediumRiskAlerts, setMediumRiskAlerts] = useState<ConsistencyAlert[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleApprove = async () => {
    try {
      const response = await fetch(`/api/foia/responses/${responseId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          acknowledge_medium_risk: acknowledged
        })
      });

      const data = await response.json();

      if (response.status === 400 && data.error?.code === 'MEDIUM_RISK_INCONSISTENCY') {
        // Show MEDIUM risk warning
        setMediumRiskAlerts(data.error.data.alerts);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error?.message || 'Approval failed');
      }

      onApprove(data.data);
    } catch (error) {
      console.error('Approval error:', error);
      alert(error.message);
    }
  };

  if (mediumRiskAlerts) {
    return (
      <div className="consistency-warning-dialog">
        <h3>⚠️ Exemption Consistency Warning</h3>
        <p>Potential inconsistencies detected in exemption decisions:</p>

        {mediumRiskAlerts.map((alert, idx) => (
          <div key={idx} className="alert-card">
            <div className="alert-header">
              <strong>{alert.exemption_code}</strong>
              <span className={`severity ${alert.severity.toLowerCase()}`}>
                {alert.severity}
              </span>
            </div>
            <p className="explanation">{alert.explanation}</p>
            <p className="suggested-action">
              <strong>Suggested Action:</strong> {alert.suggested_action}
            </p>
          </div>
        ))}

        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I have reviewed the warnings and wish to proceed with approval
        </label>

        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={handleApprove}
            disabled={!acknowledged}
            className="primary"
          >
            Acknowledge and Approve
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="approval-dialog">
      <h3>Approve Response</h3>
      <p>Are you sure you want to approve this FOIA response?</p>

      <div className="dialog-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={handleApprove} className="primary">
          Approve Response
        </button>
      </div>
    </div>
  );
}
```

### Step 2: Handle HIGH Risk Blocking

When a HIGH risk inconsistency blocks approval, redirect to supervisor:

```typescript
// components/ResponseApprovalDialog.tsx (continued)

const handleApprove = async () => {
  try {
    const response = await fetch(`/api/foia/responses/${responseId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        acknowledge_medium_risk: acknowledged
      })
    });

    const data = await response.json();

    if (response.status === 403 && data.error?.code === 'HIGH_RISK_INCONSISTENCY') {
      // HIGH RISK: Show blocking message with supervisor override info
      showHighRiskBlockingDialog({
        checkId: data.error.data.check_id,
        alerts: data.error.data.alerts,
        summary: data.error.data.summary
      });
      return;
    }

    // ... rest of approval logic ...
  } catch (error) {
    console.error('Approval error:', error);
  }
};

function showHighRiskBlockingDialog({ checkId, alerts, summary }) {
  return (
    <div className="high-risk-blocking-dialog">
      <h3>🛑 High Risk Inconsistency Detected</h3>
      <p className="summary">{summary}</p>

      <div className="alerts">
        {alerts.map((alert, idx) => (
          <div key={idx} className="alert-card high-risk">
            <strong>{alert.exemption_code}</strong>
            <p>{alert.explanation}</p>
            <p><strong>Action:</strong> {alert.suggested_action}</p>
          </div>
        ))}
      </div>

      <div className="supervisor-notice">
        <p>
          This response cannot be approved due to significant exemption inconsistencies.
          A FOIA Supervisor must review and override this check.
        </p>
        <p>
          <strong>Check ID:</strong> <code>{checkId}</code>
        </p>
      </div>

      <div className="dialog-actions">
        <button onClick={closeDialog}>Close</button>
        <button
          onClick={() => notifySupervisor(checkId)}
          className="primary"
        >
          Notify Supervisor
        </button>
      </div>
    </div>
  );
}
```

### Step 3: Supervisor Override Interface

Create a supervisor interface for reviewing and overriding HIGH risk checks:

```typescript
// components/SupervisorConsistencyQueue.tsx
import React, { useEffect, useState } from 'react';

export function SupervisorConsistencyQueue() {
  const [pendingChecks, setPendingChecks] = useState([]);

  useEffect(() => {
    fetchPendingChecks();
  }, []);

  const fetchPendingChecks = async () => {
    const response = await fetch('/api/ai/consistency/history?status=PENDING&risk_level=HIGH', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await response.json();
    setPendingChecks(data.data);
  };

  const handleOverride = async (checkId: string, justification: string) => {
    const response = await fetch(`/api/ai/consistency/checks/${checkId}/override`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ justification })
    });

    if (response.ok) {
      alert('Check overridden successfully');
      fetchPendingChecks(); // Refresh list
    }
  };

  return (
    <div className="supervisor-queue">
      <h2>Pending High Risk Consistency Checks ({pendingChecks.length})</h2>

      {pendingChecks.map(check => (
        <ConsistencyCheckCard
          key={check.id}
          check={check}
          onOverride={handleOverride}
        />
      ))}
    </div>
  );
}

function ConsistencyCheckCard({ check, onOverride }) {
  const [justification, setJustification] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  return (
    <div className="check-card">
      <div className="check-header">
        <span className="risk-badge high">HIGH RISK</span>
        <span className="date">{new Date(check.checked_at).toLocaleDateString()}</span>
      </div>

      <p className="summary">{check.summary}</p>

      <div className="alerts">
        {check.alerts.map((alert, idx) => (
          <div key={idx} className="alert">
            <strong>{alert.exemption_code}:</strong> {alert.explanation}
          </div>
        ))}
      </div>

      <div className="check-actions">
        <button onClick={() => viewResponse(check.foia_response_id)}>
          View Response
        </button>
        <button onClick={() => setShowOverrideForm(!showOverrideForm)}>
          Override Check
        </button>
      </div>

      {showOverrideForm && (
        <div className="override-form">
          <label>
            Override Justification (required):
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Provide a detailed justification for overriding this consistency check..."
              rows={4}
            />
          </label>
          <button
            onClick={() => onOverride(check.id, justification)}
            disabled={justification.length < 10}
          >
            Submit Override
          </button>
        </div>
      )}
    </div>
  );
}
```

### Step 4: Exemption Heatmap Dashboard

Display the exemption inconsistency heatmap:

```typescript
// components/ExemptionHeatmap.tsx
import React, { useEffect, useState } from 'react';

export function ExemptionHeatmap() {
  const [heatmapData, setHeatmapData] = useState(null);

  useEffect(() => {
    fetchHeatmap();
  }, []);

  const fetchHeatmap = async () => {
    const response = await fetch('/api/ai/consistency/exemption-heatmap', {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const data = await response.json();
    setHeatmapData(data.data);
  };

  if (!heatmapData) return <div>Loading...</div>;

  return (
    <div className="exemption-heatmap">
      <h2>Exemption Inconsistency Heatmap</h2>

      <div className="heatmap-summary">
        <div className="metric">
          <span className="value">{heatmapData.total_checks}</span>
          <span className="label">Total Checks</span>
        </div>
        <div className="metric">
          <span className="value">{(heatmapData.overall_inconsistency_rate * 100).toFixed(1)}%</span>
          <span className="label">Inconsistency Rate</span>
        </div>
        <div className="metric">
          <span className="value">{heatmapData.high_risk_count}</span>
          <span className="label">High Risk Cases</span>
        </div>
      </div>

      <table className="heatmap-table">
        <thead>
          <tr>
            <th>Exemption</th>
            <th>Applications</th>
            <th>Inconsistency Rate</th>
            <th>Trend</th>
            <th>Most Common Issue</th>
            <th>Departments</th>
          </tr>
        </thead>
        <tbody>
          {heatmapData.exemptions.map(exemption => (
            <tr key={exemption.exemption_code}>
              <td><strong>{exemption.exemption_code}</strong></td>
              <td>{exemption.total_applications}</td>
              <td>
                <span
                  className={`rate ${getInconsistencyClass(exemption.inconsistency_rate)}`}
                >
                  {(exemption.inconsistency_rate * 100).toFixed(1)}%
                </span>
              </td>
              <td>
                <span className={`trend ${exemption.trend.toLowerCase()}`}>
                  {exemption.trend}
                </span>
              </td>
              <td>{exemption.most_common_discrepancy}</td>
              <td>{exemption.departments_affected.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getInconsistencyClass(rate: number): string {
  if (rate > 0.2) return 'high';
  if (rate > 0.1) return 'medium';
  return 'low';
}
```

---

## Testing Integration

### Step 1: Unit Tests

Run the consistency test suite:

```bash
npm test modules/foia/ai-features/consistency/__tests__/consistency.test.ts
```

### Step 2: Integration Test

Test the full approval workflow with consistency checking:

```typescript
// __tests__/integration/response-approval.test.ts
import request from 'supertest';
import { app } from '../../src/app';

describe('Response Approval with Consistency Check', () => {
  it('should approve response with LOW risk exemptions', async () => {
    const response = await request(app)
      .post('/api/foia/responses/123/approve')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should require acknowledgment for MEDIUM risk', async () => {
    // First attempt without acknowledgment
    const response1 = await request(app)
      .post('/api/foia/responses/456/approve')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(response1.status).toBe(400);
    expect(response1.body.error.code).toBe('MEDIUM_RISK_INCONSISTENCY');

    // Second attempt with acknowledgment
    const response2 = await request(app)
      .post('/api/foia/responses/456/approve')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ acknowledge_medium_risk: true });

    expect(response2.status).toBe(200);
  });

  it('should block approval for HIGH risk', async () => {
    const response = await request(app)
      .post('/api/foia/responses/789/approve')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('HIGH_RISK_INCONSISTENCY');
  });

  it('should allow supervisor to override HIGH risk', async () => {
    // Override the check
    const override = await request(app)
      .post('/api/ai/consistency/checks/check-123/override')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        justification: 'New policy directive requires stricter application...'
      });

    expect(override.status).toBe(200);

    // Now approval should succeed
    const approval = await request(app)
      .post('/api/foia/responses/789/approve')
      .set('Authorization', `Bearer ${officerToken}`)
      .set('x-consistency-bypass', `override:check-123`)
      .send({});

    expect(approval.status).toBe(200);
  });
});
```

---

## Production Deployment

### Step 1: Environment Variables

No additional environment variables required - uses shared AI client configuration.

### Step 2: Database Migration

Run migration in production:

```bash
# Backup database first
pg_dump -d production_db > backup_$(date +%Y%m%d).sql

# Apply migration
psql -d production_db -f modules/foia/migrations/012_consistency_checks.sql
```

### Step 3: Deploy Code

Deploy the backend with the new routes and middleware:

```bash
# Build TypeScript
npm run build

# Deploy to your hosting environment
# (Vercel, AWS, Heroku, etc.)
```

### Step 4: Start Worker Process

Ensure the monthly report cron job is running:

```bash
# If using PM2
pm2 start dist/workers/index.js --name foia-workers

# Verify it's running
pm2 logs foia-workers
```

### Step 5: Monitor

Set up monitoring for:

- Consistency check processing time
- HIGH risk check rate
- Override rate
- Monthly report generation success

---

## Rollback Plan

If you need to rollback:

```sql
-- Drop consistency tables
DROP TABLE IF EXISTS "FoiaConsistencyReports";
DROP TABLE IF EXISTS "FoiaConsistencyChecks";
```

Remove middleware from approval endpoint and redeploy.

---

## Support

For issues:
- Check logs for error messages
- Verify AI client is configured correctly
- Ensure database migration was applied
- Test with a sample response

Common issues:
- **AI call timeouts**: Check Claude API rate limits
- **HIGH risk not blocking**: Verify middleware order
- **Reports not generating**: Check cron schedule and worker logs
