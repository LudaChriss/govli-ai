# AI-3 + AI-11: Pattern Intelligence & Proactive Disclosure Engine

## Overview

This module provides two integrated AI-powered features:

- **AI-3: Cross-Request Pattern Intelligence** - Analyzes historical FOIA requests to identify patterns, trends, and optimization opportunities
- **AI-11: Proactive Disclosure Engine** - Identifies frequently-requested records that should be proactively published to the reading room

## Features

### AI-3: Pattern Analysis

1. **Request Clustering** - Groups similar requests into topic clusters using Claude AI
2. **Trend Analysis** - Identifies increasing, stable, or decreasing request patterns
3. **Repeat Requester Detection** - Flags requesters filing 3+ similar requests for proactive outreach
4. **Routing Optimization** - Recommends routing improvements based on department performance

### AI-11: Proactive Disclosure

1. **Candidate Identification** - Analyzes pattern clusters to recommend proactive publications
2. **Impact Estimation** - Predicts request deflection rates and cost savings
3. **Decision Workflow** - Supervisor approval/dismissal workflow for candidates
4. **Reading Room Impact Tracking** - Measures actual impact of proactive disclosures

## Architecture

```
modules/foia/ai-features/patterns/
├── src/
│   ├── services/
│   │   ├── patternService.ts      # AI-3 implementation
│   │   └── proactiveService.ts    # AI-11 implementation
│   ├── routes/
│   │   └── patternsRoutes.ts      # Express routes
│   └── types/
│       └── index.ts               # TypeScript types
├── __tests__/
│   └── patterns.test.ts           # Test suite
└── README.md
```

## API Endpoints

All endpoints require JWT authentication with appropriate role permissions.

### AI-3: Pattern Analysis Endpoints

#### POST /ai/patterns/analyze

Run pattern analysis on historical requests (typically via cron).

**Auth**: `foia_supervisor`, `admin`, `system`

**Request Body**:
```json
{
  "lookback_months": 24,
  "min_cluster_size": 3
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "tenant_id": "tenant-uuid",
    "job_type": "PATTERN_ANALYSIS",
    "status": "COMPLETED",
    "patterns_identified": 12,
    "started_at": "2024-03-11T02:00:00Z",
    "completed_at": "2024-03-11T02:05:23Z",
    "duration_ms": 323000
  },
  "timestamp": "2024-03-11T02:05:23Z"
}
```

#### GET /ai/patterns/clusters

Get pattern clusters with optional filtering.

**Auth**: `foia_supervisor`, `admin`

**Query Parameters**:
- `department` (optional): Filter by department
- `trend` (optional): INCREASING, STABLE, or DECREASING
- `min_request_count` (optional): Minimum request count threshold

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "cluster-uuid",
      "cluster_name": "Police Incident Reports",
      "record_types": ["incident reports", "accident reports"],
      "department_most_likely": "Police",
      "request_count_12mo": 25,
      "request_count_all_time": 50,
      "trend": "INCREASING",
      "typical_requester_profile": "Citizens and journalists",
      "notable_patterns": ["High frequency in January", "Downtown area focus"],
      "request_ids": ["req-1", "req-2", "..."],
      "analysis_date": "2024-03-11T02:05:00Z",
      "model_used": "claude-3-5-sonnet-20241022",
      "confidence_score": 0.85
    }
  ]
}
```

#### GET /ai/patterns/repeat-requesters

Identify repeat requesters for proactive outreach.

**Auth**: `foia_supervisor`, `admin`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "requester-uuid",
      "requester_email": "citizen@example.com",
      "requester_name": "John Doe",
      "request_count_12mo": 5,
      "similar_request_clusters": ["Police Reports", "Building Permits"],
      "pattern_description": "Filed 5 requests in the last 12 months",
      "proactive_outreach_recommended": true,
      "proactive_outreach_reason": "High volume of similar requests",
      "first_request_date": "2023-06-15T10:00:00Z",
      "last_request_date": "2024-03-01T14:30:00Z"
    }
  ]
}
```

#### GET /ai/patterns/routing-optimization

Get routing optimization recommendations.

**Auth**: `foia_supervisor`, `admin`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "routing-uuid",
      "department": "Legal",
      "topic_cluster": "General",
      "avg_response_days": 25.5,
      "request_count": 15,
      "recommendation": "Department shows avg response time of 26 days. Consider reviewing workload distribution.",
      "status": "PENDING"
    }
  ]
}
```

#### GET /ai/patterns/dashboard

Get pattern analysis dashboard metrics.

**Auth**: `foia_supervisor`, `admin`

**Response**:
```json
{
  "success": true,
  "data": {
    "total_clusters": 12,
    "increasing_trends": 5,
    "decreasing_trends": 2,
    "repeat_requesters_count": 8,
    "routing_optimizations_pending": 3,
    "last_analysis_date": "2024-03-11T02:05:00Z"
  }
}
```

### AI-11: Proactive Disclosure Endpoints

#### POST /ai/proactive/scan

Scan for proactive disclosure candidates (typically via cron).

**Auth**: `foia_supervisor`, `admin`, `system`

**Request Body**:
```json
{
  "frequency_threshold": 5,
  "lookback_months": 12
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "job-uuid",
    "job_type": "PROACTIVE_SCAN",
    "status": "COMPLETED",
    "candidates_generated": 8,
    "duration_ms": 245000
  }
}
```

#### GET /ai/proactive/candidates

Get proactive disclosure candidates.

**Auth**: `foia_supervisor`, `admin`

**Query Parameters**:
- `status` (optional): PENDING, APPROVED, DISMISSED, PUBLISHED
- `should_publish_only` (optional): boolean
- `min_frequency_score` (optional): number

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "candidate-uuid",
      "cluster_name": "Police Incident Reports",
      "should_publish": true,
      "recommended_record_types": ["incident reports"],
      "publish_format": "redacted_template",
      "frequency_score": 25,
      "estimated_request_deflection_pct": 60,
      "estimated_annual_requests": 30,
      "justification": "High frequency requests with clear public interest value",
      "caveats": ["May contain sensitive information requiring redaction"],
      "public_interest_score": 0.8,
      "status": "PENDING",
      "scan_date": "2024-03-10T03:00:00Z"
    }
  ]
}
```

#### POST /ai/proactive/candidates/:id/decision

Make decision on proactive disclosure candidate.

**Auth**: `foia_supervisor`, `admin`

**Request Body (Approve)**:
```json
{
  "decision": "approve",
  "notes": "Good candidate for reading room"
}
```

**Request Body (Dismiss)**:
```json
{
  "decision": "dismiss",
  "dismissal_reason": "Contains too much sensitive information"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "candidate-uuid",
    "status": "APPROVED",
    "decision_made_by": "user-uuid",
    "decision_made_at": "2024-03-11T14:30:00Z"
  }
}
```

#### GET /ai/proactive/reading-room-impact

Get impact metrics for proactive disclosures.

**Auth**: `foia_officer`, `foia_supervisor`, `admin`

**Response**:
```json
{
  "success": true,
  "data": {
    "total_candidates_published": 5,
    "total_requests_deflected": 150,
    "total_staff_hours_saved": 300,
    "total_cost_savings_usd": 15000,
    "monthly_breakdown": [
      {
        "month": "2024-03",
        "requests_deflected": 50,
        "staff_hours_saved": 100,
        "cost_savings": 5000
      }
    ],
    "top_performing_disclosures": [
      {
        "candidate_id": "candidate-uuid",
        "cluster_name": "Police Incident Reports",
        "requests_deflected": 80,
        "published_at": "2024-01-15T00:00:00Z"
      }
    ]
  }
}
```

#### GET /ai/proactive/dashboard

Get proactive disclosure dashboard metrics.

**Auth**: `foia_supervisor`, `admin`

**Response**:
```json
{
  "success": true,
  "data": {
    "pending_candidates": 10,
    "approved_candidates": 5,
    "published_disclosures": 3,
    "total_requests_deflected_12mo": 150,
    "total_hours_saved_12mo": 300,
    "total_cost_savings_12mo": 15000,
    "last_scan_date": "2024-03-10T03:00:00Z"
  }
}
```

## Cron Jobs

### Pattern Analysis (Nightly)

Runs nightly at 2am to analyze request patterns.

**Schedule**: `0 2 * * *` (2am daily)

```typescript
import { Pool } from 'pg';
import { initPatternCrons } from './workers/pattern-crons';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const crons = initPatternCrons(db, {
  patternAnalysis: {
    enabled: true,
    schedule: '0 2 * * *'
  }
});

crons.startPatternAnalysis();
```

### Proactive Scan (Weekly)

Runs weekly on Sunday at 3am to identify proactive disclosure candidates.

**Schedule**: `0 3 * * 0` (Sunday 3am)

```typescript
const crons = initPatternCrons(db, {
  proactiveScan: {
    enabled: true,
    schedule: '0 3 * * 0',
    frequencyThreshold: 5
  }
});

crons.startProactiveScan();
```

### Manual Triggers

```typescript
// Trigger pattern analysis manually
await crons.triggerPatternAnalysis('tenant-id');

// Trigger proactive scan manually
await crons.triggerProactiveScan('tenant-id');
```

## Database Tables

### FoiaRequestPatterns

Stores identified pattern clusters.

**Unique Constraint**: `(tenant_id, cluster_name)`

### FoiaRepeatRequesters

Tracks repeat requesters for proactive outreach.

**Unique Constraint**: `(tenant_id, requester_email)`

### FoiaRoutingOptimizations

Routing improvement recommendations.

### FoiaProactiveCandidates

Proactive disclosure candidates.

**Unique Constraint**: `(tenant_id, cluster_name)`

### FoiaProactiveImpact

Tracks impact of published proactive disclosures.

### FoiaPatternAnalysisJobs

Job execution log for pattern analysis and scans.

## Events

The module emits the following events via the analytics bus:

- `foia.ai.patterns.analyzed` - Pattern analysis completed
- `foia.ai.proactive.candidates_generated` - Proactive candidates generated
- `foia.ai.proactive.decision_made` - Decision made on candidate

## Testing

Run the test suite:

```bash
npm test ai-features/patterns
```

Tests cover:
- Pattern clustering and storage
- Repeat requester detection
- Routing optimization analysis
- Proactive candidate generation
- Decision workflow
- Impact tracking
- Edge cases and error handling

## Admin Dashboard Widget

The `ProactiveCandidatesWidget` component displays the top 5 pending proactive candidates in the admin dashboard.

```tsx
import ProactiveCandidatesWidget from '@/admin/components/ProactiveCandidatesWidget';

<ProactiveCandidatesWidget
  tenantId={currentTenant.id}
  apiBaseUrl={process.env.API_BASE_URL}
  authToken={authToken}
/>
```

## Configuration

Environment variables:

```env
# AI Client
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://...

# Cron Configuration
PATTERN_ANALYSIS_ENABLED=true
PATTERN_ANALYSIS_SCHEDULE="0 2 * * *"

PROACTIVE_SCAN_ENABLED=true
PROACTIVE_SCAN_SCHEDULE="0 3 * * 0"
PROACTIVE_FREQUENCY_THRESHOLD=5
```

## Best Practices

1. **Run pattern analysis after hours** - Nightly at 2am to avoid peak usage
2. **Review candidates promptly** - Review proactive candidates within 48 hours of generation
3. **Track impact** - Monitor reading room metrics to measure effectiveness
4. **Customize thresholds** - Adjust frequency thresholds based on your agency's request volume
5. **Proactive outreach** - Use repeat requester data to engage with high-volume requesters

## Troubleshooting

### Pattern analysis not running

Check cron job status and logs:

```typescript
const status = crons.getStatus();
console.log(status);
```

### No candidates generated

Verify:
- Pattern analysis has run recently
- Frequency threshold is appropriate for your request volume
- Pattern clusters exist with sufficient request counts

### High AI costs

- Use the model router to automatically select appropriate models
- Monitor token budget usage
- Consider running scans less frequently

## Support

For issues or questions:
- Review API documentation
- Check test suite for examples
- Consult RULES.md for coding standards
