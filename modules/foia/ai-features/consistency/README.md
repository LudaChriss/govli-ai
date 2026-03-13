# AI-4: Exemption Consistency Analyzer

**AI-powered exemption consistency checking that hooks into the A-4 response approval workflow**

## Overview

The Exemption Consistency Analyzer automatically checks FOIA responses for exemption inconsistencies before approval. It compares current exemption decisions against historical patterns to identify potential over-redaction, under-redaction, or inconsistent criteria application.

### Key Features

- **Risk-Based Workflow**: THREE levels of risk with different behaviors
  - **HIGH**: Blocks approval, requires supervisor override with written justification
  - **MEDIUM**: Shows warning, requires acknowledgment to proceed
  - **LOW**: Silent pass, logs only
- **Historical Pattern Analysis**: Compares against 90 days of similar cases
- **Supervisor Override**: HIGH risk cases require supervisor review and justification
- **Exemption Heatmap**: Visual analysis of which exemptions are most inconsistent
- **Monthly Reports**: Automated reports with AI-generated findings and recommendations
- **Middleware Integration**: Seamlessly hooks into existing A-4 response approval endpoints

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    A-4: Response Approval Flow                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              AI-4: Consistency Check Middleware                  │
│                                                                   │
│  1. Extract exemption decisions from response                    │
│  2. Fetch historical patterns (90 days)                          │
│  3. Call Claude 3.5 Sonnet for analysis                          │
│  4. Store check result with risk level                           │
│  5. Apply workflow based on risk:                                │
│     - HIGH: Block (403) → Supervisor Override Required           │
│     - MEDIUM: Warn (400) → Acknowledgment Required               │
│     - LOW: Pass → Continue to approval                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Response Approval Handler                     │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### FoiaConsistencyChecks
Stores results of consistency analysis:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `foia_response_id` | UUID | Response being checked |
| `is_consistent` | BOOLEAN | Whether exemptions align with patterns |
| `overall_risk` | VARCHAR | LOW, MEDIUM, or HIGH |
| `alerts` | JSONB | Array of ConsistencyAlert objects |
| `summary` | TEXT | AI-generated summary |
| `prior_cases_reviewed` | INTEGER | Number of historical cases analyzed |
| `status` | VARCHAR | PENDING (for HIGH), COMPLETED, OVERRIDDEN |
| `overridden_by` | UUID | Supervisor who overrode (if applicable) |
| `override_justification` | TEXT | Written justification for override |

### FoiaConsistencyReports
Monthly consistency reports:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `report_month` | DATE | Month being reported (first day) |
| `total_checks` | INTEGER | Total consistency checks |
| `high_risk_count` | INTEGER | High risk inconsistencies |
| `overall_consistency_rate` | DECIMAL | Percentage consistent |
| `most_inconsistent_exemptions` | JSONB | Problem exemptions |
| `critical_findings` | JSONB | AI-generated findings |
| `recommendations` | JSONB | AI-generated recommendations |

## API Endpoints

### Consistency Check Endpoints

#### `POST /api/ai/consistency/check`
Run consistency check on exemption decisions.

**Auth**: `foia_officer+`

**Request**:
```json
{
  "response_id": "uuid",
  "exemption_decisions": [
    {
      "exemption_code": "b5",
      "information_type": "internal_deliberations",
      "decision": "EXEMPT"
    }
  ],
  "record_types": ["emails", "memos"],
  "department": "Human Resources",
  "requester_category": "media"
}
```

**Response (LOW risk)**:
```json
{
  "success": true,
  "data": {
    "id": "check-uuid",
    "overall_risk": "LOW",
    "is_consistent": true,
    "alerts": [],
    "summary": "All exemption decisions align with historical patterns.",
    "prior_cases_reviewed": 27,
    "status": "COMPLETED"
  }
}
```

**Response (HIGH risk)**:
```json
{
  "success": false,
  "error": {
    "code": "HIGH_RISK_INCONSISTENCY",
    "message": "High risk inconsistency detected. Supervisor override required.",
    "data": {
      "check_id": "check-uuid",
      "alerts": [
        {
          "alert_type": "OVER_REDACTION",
          "exemption_code": "b5",
          "severity": "HIGH",
          "explanation": "Historical pattern shows b5 for internal_deliberations is typically DISCLOSED...",
          "suggested_action": "Review historical cases to ensure this exemption is justified."
        }
      ],
      "override_required": true
    }
  }
}
```

#### `POST /api/ai/consistency/checks/:id/override`
Override a HIGH risk consistency check (supervisor only).

**Auth**: `foia_supervisor+`

**Request**:
```json
{
  "justification": "Reviewed the case details. New policy directive from General Counsel mandates stricter application of b5 for all internal deliberations involving executive staff, regardless of historical patterns."
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "check-uuid",
    "status": "OVERRIDDEN",
    "overridden_by": "user-uuid",
    "override_justification": "..."
  },
  "message": "Consistency check overridden successfully"
}
```

#### `GET /api/ai/consistency/history`
Get consistency check history.

**Auth**: `foia_supervisor+`

**Query Parameters**:
- `start_date`: ISO date (optional)
- `end_date`: ISO date (optional)
- `risk_level`: LOW | MEDIUM | HIGH (optional)
- `department`: string (optional)
- `status`: PENDING | COMPLETED | OVERRIDDEN (optional)
- `limit`: integer (default: 50)
- `offset`: integer (default: 0)

#### `GET /api/ai/consistency/exemption-heatmap`
Get exemption inconsistency heatmap data.

**Auth**: `foia_supervisor+`

**Response**:
```json
{
  "success": true,
  "data": {
    "exemptions": [
      {
        "exemption_code": "b5",
        "exemption_name": "Deliberative Process Privilege",
        "total_applications": 45,
        "inconsistent_applications": 12,
        "inconsistency_rate": 0.267,
        "most_common_discrepancy": "OVER_REDACTION",
        "departments_affected": ["HR", "Legal"],
        "trend": "INCREASING"
      }
    ],
    "overall_inconsistency_rate": 0.205,
    "total_checks": 83,
    "high_risk_count": 8
  }
}
```

#### `GET /api/ai/consistency/dashboard`
Get consistency dashboard metrics.

**Auth**: `foia_supervisor+`

**Response**:
```json
{
  "success": true,
  "data": {
    "checks_last_30_days": 42,
    "high_risk_last_30_days": 6,
    "override_rate_last_30_days": 0.143,
    "avg_consistency_rate": 0.857,
    "most_inconsistent_exemption": {
      "code": "b5",
      "rate": 0.285
    },
    "pending_high_risk_count": 2
  }
}
```

### Monthly Report Endpoints

#### `POST /api/ai/consistency/reports/generate`
Generate a monthly consistency report.

**Auth**: `foia_supervisor+`

**Request**:
```json
{
  "report_month": "2024-01-01"
}
```

#### `GET /api/ai/consistency/reports`
List all monthly reports.

**Auth**: `foia_supervisor+`

**Query Parameters**:
- `limit`: integer (default: 12)
- `offset`: integer (default: 0)

#### `GET /api/ai/consistency/reports/:month`
Get a specific monthly report (month format: `YYYY-MM` or `YYYY-MM-DD`).

**Auth**: `foia_supervisor+`

**Example**: `GET /api/ai/consistency/reports/2024-01`

## Middleware Integration

### Basic Usage

```typescript
import { consistencyCheckMiddleware } from './ai-features/consistency/middleware';

// Add to response approval endpoint
router.post('/responses/:id/approve',
  authMiddleware,
  consistencyCheckMiddleware(db, {
    requireAcknowledgmentForMedium: true,
    autoPassLowRisk: true
  }),
  async (req, res) => {
    // Consistency check passed, proceed with approval
    const { check_id, overall_risk } = req.consistencyCheck || {};

    // ... approve response logic ...
  }
);
```

### Configuration Options

```typescript
interface ConsistencyMiddlewareOptions {
  /**
   * Skip consistency check for certain roles (e.g., system)
   * Default: ['system']
   */
  skipForRoles?: string[];

  /**
   * Automatically bypass LOW risk checks
   * Default: true
   */
  autoPassLowRisk?: boolean;

  /**
   * Require acknowledgment for MEDIUM risk
   * Default: true
   */
  requireAcknowledgmentForMedium?: boolean;
}
```

### Handling MEDIUM Risk

When a MEDIUM risk inconsistency is detected, the client should:

1. Show the warning to the FOIA officer
2. Display the alerts and suggested actions
3. Require the officer to acknowledge the warning
4. Resubmit approval with `acknowledge_medium_risk: true`

```typescript
// First attempt - returns 400 with warning
POST /responses/123/approve
{
  // ... approval data ...
}

// Response:
{
  "success": false,
  "error": {
    "code": "MEDIUM_RISK_INCONSISTENCY",
    "message": "Potential exemption inconsistency detected. Review and acknowledge to proceed.",
    "data": {
      "check_id": "check-uuid",
      "alerts": [...],
      "acknowledgment_required": true,
      "instructions": "Review alerts and resubmit with acknowledge_medium_risk=true"
    }
  }
}

// Second attempt - with acknowledgment
POST /responses/123/approve
{
  // ... approval data ...
  "acknowledge_medium_risk": true
}

// Proceeds with approval
```

### Handling HIGH Risk

For HIGH risk cases:

1. Approval is blocked (403 Forbidden)
2. Only a supervisor can override
3. Override requires written justification

```typescript
// Approval attempt returns 403
POST /responses/123/approve

// Response:
{
  "success": false,
  "error": {
    "code": "HIGH_RISK_INCONSISTENCY",
    "message": "High risk inconsistency detected. Supervisor override required.",
    "data": {
      "check_id": "check-uuid",
      "alerts": [...],
      "override_required": true,
      "override_endpoint": "/api/ai/consistency/checks/check-uuid/override"
    }
  }
}

// Supervisor reviews and overrides
POST /api/ai/consistency/checks/check-uuid/override
{
  "justification": "Detailed justification explaining why the inconsistency is acceptable..."
}

// After override, approval can proceed
// Officer can retry approval or use bypass token
POST /responses/123/approve
Headers: { "x-consistency-bypass": "override:check-uuid" }
```

## Automated Monthly Reports

Monthly consistency reports are automatically generated on the 1st of each month at 6:00 AM.

### Setting Up the Cron Job

```typescript
import { Pool } from 'pg';
import { MonthlyConsistencyReportCron } from './workers/monthly-consistency-report-cron';

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const reportCron = new MonthlyConsistencyReportCron(db, {
  schedule: '0 6 1 * *', // 6am on 1st of month
  runOnStartup: false,
  notifySupervisors: true,
  timezone: 'America/New_York'
});

await reportCron.start();
```

### Manual Report Generation

Supervisors can also manually generate reports via the API:

```bash
curl -X POST http://localhost:3000/api/ai/consistency/reports/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"report_month": "2024-01-01"}'
```

### Report Contents

Each monthly report includes:

- **Summary Metrics**: Total checks, high/medium/low risk counts, override count
- **Consistency Rate**: Overall percentage of consistent exemption applications
- **Problem Exemptions**: Which exemptions are most frequently inconsistent
- **Departments with Issues**: Departments with high inconsistency rates
- **Critical Findings**: AI-generated analysis of patterns and concerns
- **Recommendations**: AI-generated actionable recommendations for improvement

## AI Integration

### Model Used
- **Claude 3.5 Sonnet** (`claude-3-5-sonnet-20241022`)
- Analyzes exemption decisions against historical patterns
- Generates detailed explanations and suggested actions
- Creates monthly report findings and recommendations

### AI Analysis Process

1. **Historical Pattern Extraction**: Fetch 90 days of similar cases (same department, record types)
2. **Pattern Comparison**: Compare current decisions to historical majority patterns
3. **Risk Assessment**: Determine severity based on deviation magnitude and case count
4. **Alert Generation**: Create specific alerts with explanations and suggested actions
5. **Summary Generation**: Produce human-readable summary of findings

### Audit Trail

All AI calls are audited via `getAIClient().callWithAudit()`:
- Tenant ID
- User ID
- Feature: `ai-4-consistency-check` or `ai-4-monthly-report`
- Model used
- Tokens consumed
- Timestamp

## Testing

Run the comprehensive test suite:

```bash
npm test modules/foia/ai-features/consistency/__tests__/consistency.test.ts
```

### Test Coverage

- ✅ LOW risk consistent exemptions
- ✅ HIGH risk inconsistency detection and blocking
- ✅ MEDIUM risk warnings and acknowledgment flow
- ✅ No historical data handling
- ✅ Supervisor override workflow
- ✅ History retrieval with filtering
- ✅ Exemption heatmap generation
- ✅ Dashboard metrics calculation

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Consistency Rate**: Overall percentage of consistent exemption applications (target: >85%)
2. **HIGH Risk Rate**: Percentage of checks flagged as HIGH risk (target: <5%)
3. **Override Rate**: Percentage of HIGH risk checks overridden by supervisors
4. **Processing Time**: Average time for consistency check (target: <2 seconds)

### Recommended Alerts

- Alert if consistency rate drops below 70% for 7 consecutive days
- Alert if HIGH risk rate exceeds 10% in a single week
- Alert if pending HIGH risk checks exceed 10 cases

## Migration

Apply the database migration:

```bash
psql -d govli_foia -f modules/foia/migrations/012_consistency_checks.sql
```

## Configuration

### Environment Variables

None required - uses shared AI client configuration from `@govli/foia-shared`.

### Feature Flags

Consider adding feature flags for:
- `consistency_checks_enabled`: Master switch for consistency checking
- `consistency_high_risk_blocking`: Whether HIGH risk blocks approval
- `consistency_monthly_reports`: Enable/disable automated monthly reports

## Best Practices

### For FOIA Officers

1. **Review Alerts Carefully**: Each alert includes historical context and suggested actions
2. **Acknowledge MEDIUM Risk**: Don't blindly acknowledge - review the explanation first
3. **Document Deviations**: If you knowingly deviate from patterns, add notes to the response

### For Supervisors

1. **Provide Detailed Justifications**: Override justifications are part of the permanent record
2. **Review Monthly Reports**: Use reports to identify systemic issues and training needs
3. **Monitor Exemption Heatmap**: Identify which exemptions need clearer guidance

### For Administrators

1. **Set Realistic Thresholds**: Adjust alert thresholds based on your organization's consistency baseline
2. **Train on Patterns**: Use consistency data to inform training programs
3. **Update Guidance**: When patterns shift, update official exemption guidance

## Troubleshooting

### "Consistency check failed" errors

- Check AI client configuration in `@govli/foia-shared`
- Verify Claude API credentials are valid
- Check database connectivity

### HIGH risk checks not blocking approval

- Verify middleware is added to approval route
- Check middleware configuration options
- Ensure proper error handling in route

### Monthly reports not generating

- Check cron job is started
- Verify database connectivity
- Review worker logs for errors

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/govli-ai/issues
- Documentation: See `INTEGRATION_GUIDE.md` for detailed integration instructions
