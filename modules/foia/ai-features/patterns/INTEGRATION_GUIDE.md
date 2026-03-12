# AI-3 + AI-11 Integration Guide

## Quick Start

This guide shows how to integrate the Pattern Intelligence and Proactive Disclosure features into your FOIA system.

## Prerequisites

- Node.js 18+ with TypeScript
- PostgreSQL database
- Anthropic API key
- Existing FOIA request data

## Step 1: Database Migration

Run the migrations to create required tables:

```bash
# Run migration 010 (pattern tables)
psql $DATABASE_URL -f modules/foia/migrations/010_patterns_and_proactive.sql

# Run migration 011 (unique constraints)
psql $DATABASE_URL -f modules/foia/migrations/011_add_pattern_unique_constraints.sql
```

Verify tables were created:

```sql
SELECT tablename FROM pg_tables
WHERE tablename LIKE 'Foia%Pattern%' OR tablename LIKE 'Foia%Proactive%';
```

Expected tables:
- FoiaRequestPatterns
- FoiaRepeatRequesters
- FoiaRoutingOptimizations
- FoiaProactiveCandidates
- FoiaProactiveImpact
- FoiaPatternAnalysisJobs

## Step 2: Configure Environment

Add to your `.env` file:

```env
# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/govli_foia

# Pattern Analysis Cron
PATTERN_ANALYSIS_ENABLED=true
PATTERN_ANALYSIS_SCHEDULE="0 2 * * *"  # 2am daily

# Proactive Scan Cron
PROACTIVE_SCAN_ENABLED=true
PROACTIVE_SCAN_SCHEDULE="0 3 * * 0"    # Sunday 3am
PROACTIVE_FREQUENCY_THRESHOLD=5        # Min 5 requests in 12mo
```

## Step 3: Initialize Services

### In your main application file

```typescript
import { Pool } from 'pg';
import { Router } from 'express';
import { createPatternsRoutes } from './modules/foia/ai-features/patterns/src/routes/patternsRoutes';
import { initPatternCrons } from './modules/foia/workers/src/pattern-crons';

// Initialize database
const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Register API routes
const app = express();
const patternsRouter = createPatternsRoutes(db);
app.use('/api', patternsRouter);

// Initialize and start cron jobs
const crons = initPatternCrons(db, {
  patternAnalysis: {
    enabled: process.env.PATTERN_ANALYSIS_ENABLED === 'true',
    schedule: process.env.PATTERN_ANALYSIS_SCHEDULE || '0 2 * * *'
  },
  proactiveScan: {
    enabled: process.env.PROACTIVE_SCAN_ENABLED === 'true',
    schedule: process.env.PROACTIVE_SCAN_SCHEDULE || '0 3 * * 0',
    frequencyThreshold: parseInt(process.env.PROACTIVE_FREQUENCY_THRESHOLD || '5')
  }
});

// Start cron jobs
crons.startAll();

// Graceful shutdown
process.on('SIGTERM', () => {
  crons.stopAll();
  db.end();
});
```

## Step 4: Add Authentication Middleware

Ensure your auth middleware sets `req.auth` with:

```typescript
interface AuthRequest extends Request {
  auth: {
    tenant_id: string;
    user_id: string;
    role: string;  // foia_officer, foia_supervisor, admin, system
  };
}
```

Example middleware:

```typescript
import jwt from 'jsonwebtoken';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    (req as any).auth = {
      tenant_id: decoded.tenant_id,
      user_id: decoded.user_id,
      role: decoded.role
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Apply to pattern routes
app.use('/api/ai/patterns', authMiddleware);
app.use('/api/ai/proactive', authMiddleware);
```

## Step 5: Add Admin Dashboard Widget

In your admin dashboard React component:

```tsx
import ProactiveCandidatesWidget from './modules/foia/admin/components/ProactiveCandidatesWidget';

function AdminDashboard() {
  const { tenantId, authToken } = useAuth();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Other dashboard widgets */}

      <ProactiveCandidatesWidget
        tenantId={tenantId}
        apiBaseUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}
        authToken={authToken}
      />
    </div>
  );
}
```

## Step 6: Test the Integration

### 6.1 Verify API Endpoints

```bash
# Get authentication token
export TOKEN="your-jwt-token"

# Test pattern clusters endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/ai/patterns/clusters

# Test proactive candidates endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/ai/proactive/candidates
```

### 6.2 Trigger Manual Analysis (for testing)

```typescript
import { getPatternCrons } from './modules/foia/workers/src/pattern-crons';

const crons = getPatternCrons();

// Trigger pattern analysis for specific tenant
await crons.triggerPatternAnalysis('your-tenant-id');

// Trigger proactive scan
await crons.triggerProactiveScan('your-tenant-id');
```

### 6.3 Run Tests

```bash
cd modules/foia/ai-features/patterns
npm test
```

## Step 7: Monitor and Verify

### Check job execution logs

```sql
SELECT * FROM "FoiaPatternAnalysisJobs"
ORDER BY started_at DESC
LIMIT 10;
```

### View generated patterns

```sql
SELECT cluster_name, request_count_12mo, trend
FROM "FoiaRequestPatterns"
WHERE tenant_id = 'your-tenant-id'
ORDER BY request_count_12mo DESC;
```

### View proactive candidates

```sql
SELECT cluster_name, should_publish, frequency_score, status
FROM "FoiaProactiveCandidates"
WHERE tenant_id = 'your-tenant-id'
  AND status = 'PENDING'
ORDER BY frequency_score DESC;
```

## Common Integration Patterns

### Pattern 1: Custom Notification on New Candidates

```typescript
import { getSharedAIClient, emit } from '@govli/foia-shared';

// Listen for candidate generation events
eventBus.on('foia.ai.proactive.candidates_generated', async (event) => {
  const { tenant_id, metadata } = event;

  if (metadata.candidates_generated > 0) {
    // Send email to supervisor
    await sendEmail({
      to: await getSupervisorEmail(tenant_id),
      subject: `${metadata.candidates_generated} New Proactive Disclosure Candidates`,
      body: `Please review pending candidates in the admin dashboard.`
    });
  }
});
```

### Pattern 2: Custom Frequency Thresholds per Tenant

```typescript
// Override default threshold based on tenant size
const getTenantConfig = async (tenantId: string) => {
  const requestVolume = await getAverageMonthlyRequests(tenantId);

  return {
    frequencyThreshold: requestVolume > 100 ? 10 : 5
  };
};

// Use in cron initialization
const config = await getTenantConfig(tenantId);
const crons = initPatternCrons(db, {
  proactiveScan: {
    frequencyThreshold: config.frequencyThreshold
  }
});
```

### Pattern 3: Auto-Publish Low-Risk Candidates

```typescript
// Automatically approve candidates with high confidence
const candidates = await proactiveService.getCandidates(tenantId, {
  status: 'PENDING',
  should_publish_only: true
});

for (const candidate of candidates) {
  // Auto-approve if:
  // - High frequency (20+ requests)
  // - High deflection estimate (>70%)
  // - Low exemption risk record types
  if (
    candidate.frequency_score >= 20 &&
    candidate.estimated_request_deflection_pct >= 70 &&
    isLowRiskRecordType(candidate.recommended_record_types)
  ) {
    await proactiveService.makeDecision(
      tenantId,
      candidate.id,
      'system',
      { decision: 'approve', notes: 'Auto-approved by system' }
    );
  }
}
```

### Pattern 4: Integration with Reading Room Publishing Workflow

```typescript
// After supervisor approves a candidate
app.post('/api/ai/proactive/candidates/:id/decision', async (req, res) => {
  const { decision } = req.body;

  const candidate = await proactiveService.makeDecision(
    req.auth.tenant_id,
    req.params.id,
    req.auth.user_id,
    req.body
  );

  // If approved, create publishing task
  if (decision === 'approve') {
    await createPublishingTask({
      candidate_id: candidate.id,
      cluster_name: candidate.cluster_name,
      record_types: candidate.recommended_record_types,
      publish_format: candidate.publish_format,
      assigned_to: await getReadingRoomCoordinator(req.auth.tenant_id)
    });
  }

  res.json({ success: true, data: candidate });
});
```

## Troubleshooting

### Issue: Cron jobs not executing

**Solution**: Check cron job logs and verify schedule syntax:

```typescript
const crons = getPatternCrons();
console.log(crons.getStatus());
```

### Issue: No patterns identified

**Solution**:
- Ensure you have sufficient closed/fulfilled requests (10+ recommended)
- Verify requests have descriptions
- Check AI client configuration and API key

### Issue: Database constraints violated

**Solution**:
- Ensure migrations 010 and 011 were run
- Check for duplicate cluster_name entries per tenant
- Verify ON CONFLICT clauses in service code

### Issue: High AI costs

**Solution**:
- Reduce analysis frequency (weekly instead of daily)
- Use model router to select appropriate models
- Implement token budget limits
- Filter out low-value requests before analysis

## Performance Optimization

### Optimize pattern analysis for large datasets

```typescript
// Analyze only recent requests for faster execution
const result = await patternService.analyzePatterns(tenantId, {
  lookback_months: 12,  // Instead of 24
  min_cluster_size: 5   // Higher threshold
});
```

### Cache AI responses

The shared AI client automatically caches responses for 1 hour. You can extend this:

```typescript
import { getSharedAIClient } from '@govli/foia-shared';

const aiClient = getSharedAIClient();
aiClient.setPromptCache(customCacheImplementation);
```

### Database Indexing

The migrations include appropriate indexes. For additional optimization:

```sql
-- Index for faster tenant filtering
CREATE INDEX IF NOT EXISTS idx_foia_requests_tenant_status_date
ON "FoiaRequests"(tenant_id, status, "createdAt");

-- Index for department performance queries
CREATE INDEX IF NOT EXISTS idx_foia_requests_dept_dates
ON "FoiaRequests"(department, "createdAt", "updatedAt");
```

## Next Steps

1. **Monitor initial run** - Review first pattern analysis and proactive scan results
2. **Adjust thresholds** - Fine-tune frequency thresholds based on your data
3. **Train staff** - Educate supervisors on reviewing proactive candidates
4. **Measure impact** - Track request deflection rates after publishing
5. **Iterate** - Use feedback to improve pattern matching and recommendations

## Support

- API Documentation: `modules/foia/ai-features/patterns/README.md`
- Test Suite: `modules/foia/ai-features/patterns/__tests__/patterns.test.ts`
- RULES.md: Project standards and conventions
