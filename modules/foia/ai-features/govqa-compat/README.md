# GovQA Compatibility API Layer

## Overview

The GovQA Compatibility API Layer provides backward-compatible endpoints for agencies migrating from GovQA to Govli. This allows existing integrations to continue working without code changes for 12 months while agencies transition to Govli's native API.

## Features

### Zero-Downtime Migration

- **Endpoint Translation**: All GovQA API endpoints mapped to Govli equivalents
- **Field Mapping**: Automatic conversion between GovQA and Govli data formats
- **Legacy ID Support**: GovQA case numbers preserved as `legacy_id`
- **12-Month Compatibility Window**: Agencies have 12 months to migrate integrations

### Migration Tracking

- **Request Logging**: Every compatibility API call tracked in database
- **Usage Analytics**: Dashboard showing which endpoints are still in use
- **Migration Progress**: Automatic detection of migration completion
- **Admin Visibility**: Real-time view of which integrations need migration

### Compatibility Headers

All responses include:
- `X-Govli-Compat: govqa` - Indicates compatibility layer
- `X-Govli-Migration-Warning` - Reminder to migrate within 12 months

## Architecture

### Field Mapping

**GovQA → Govli:**
```
case_number      → legacy_id (migration_source='govqa')
subject          → description
department_code  → agencies_requested[0]
requester_name   → requester.name
requester_email  → requester.email
status_code      → foia_status (via status map)
assigned_to      → assigned_officer_id
created_date     → submitted_at
due_date         → statutory_deadline
close_date       → delivered_at
```

**Status Code Mapping:**
```
GovQA NEW             → Govli SUBMITTED
GovQA ASSIGNED        → Govli IN_PROGRESS
GovQA IN_PROGRESS     → Govli IN_PROGRESS
GovQA PENDING_REVIEW  → Govli PENDING_APPROVAL
GovQA CLOSED          → Govli DELIVERED
GovQA DENIED          → Govli CLOSED
GovQA WITHDRAWN       → Govli WITHDRAWN
```

### Database Schema

**FoiaCompatRequests:**
```sql
- id: UUID PK
- tenant_id: UUID FK
- endpoint: VARCHAR(100)
- govqa_case_number: VARCHAR(50)
- govli_request_id: UUID FK
- request_body: JSONB
- response_code: INTEGER
- created_at: TIMESTAMP
```

**FoiaRequests (modified):**
```sql
- legacy_id: VARCHAR(100)          -- GovQA case_number
- migration_source: VARCHAR(50)     -- 'govqa'
```

## API Endpoints

### GovQA Compatibility Endpoints

#### POST /api/compat/govqa/cases

Create new FOIA request (GovQA format).

**Request:**
```json
{
  "case_number": "GQ-2026-001",
  "subject": "Police budget records request",
  "department_code": "PD",
  "requester_name": "John Doe",
  "requester_email": "john@example.com",
  "requester_phone": "555-0123",
  "status_code": "NEW",
  "created_date": "2026-03-15T10:00:00Z",
  "due_date": "2026-04-05T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "case_number": "GQ-2026-001",
    "subject": "Police budget records request",
    "department_code": "PD",
    "requester_name": "John Doe",
    "requester_email": "john@example.com",
    "status_code": "NEW",
    "created_date": "2026-03-15T10:00:00.000Z",
    "due_date": "2026-04-05T10:00:00.000Z"
  }
}
```

#### GET /api/compat/govqa/cases/:caseNumber

Get case details by GovQA case number.

**Response:**
```json
{
  "success": true,
  "data": {
    "case_number": "GQ-2026-001",
    "subject": "Police budget records request",
    "department_code": "PD",
    "requester_name": "John Doe",
    "requester_email": "john@example.com",
    "status_code": "IN_PROGRESS",
    "assigned_to": "officer-123",
    "created_date": "2026-03-15T10:00:00.000Z",
    "due_date": "2026-04-05T10:00:00.000Z"
  }
}
```

#### GET /api/compat/govqa/cases

List cases with filters.

**Query Parameters:**
- `status` - Filter by status code
- `department` - Filter by department code
- `assigned_to` - Filter by assigned officer
- `from_date` - Start date
- `to_date` - End date
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "cases": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150,
      "total_pages": 3
    }
  }
}
```

#### GET /api/compat/govqa/cases/:caseNumber/documents

Get documents for a case.

**Response:**
```json
{
  "success": true,
  "data": {
    "case_number": "GQ-2026-001",
    "documents": [
      {
        "document_id": "doc-123",
        "case_number": "GQ-2026-001",
        "file_name": "report.pdf",
        "file_size": 1024000,
        "upload_date": "2026-03-16T14:30:00.000Z",
        "uploaded_by": "officer-456",
        "document_type": "RESPONSE"
      }
    ]
  }
}
```

#### POST /api/compat/govqa/cases/:caseNumber/documents

Upload document for a case.

**Request:**
```json
{
  "file_name": "evidence.pdf",
  "file_size": 2048000,
  "document_type": "ATTACHMENT"
}
```

#### GET /api/compat/govqa/cases/:caseNumber/messages

Get message thread for a case.

**Response:**
```json
{
  "success": true,
  "data": {
    "case_number": "GQ-2026-001",
    "messages": [
      {
        "message_id": "msg-123",
        "case_number": "GQ-2026-001",
        "sender": "Jane Officer",
        "message_text": "Request moved to in progress",
        "sent_date": "2026-03-16T09:00:00.000Z",
        "is_internal": false
      }
    ]
  }
}
```

#### POST /api/compat/govqa/cases/:caseNumber/payment

Process payment for a case.

**Request:**
```json
{
  "amount": 25.00,
  "payment_method": "CREDIT_CARD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "case_number": "GQ-2026-001",
    "payment_id": "pay-123",
    "amount": 25.00,
    "payment_method": "CREDIT_CARD",
    "status": "COMPLETED",
    "transaction_date": "2026-03-16T10:30:00.000Z"
  }
}
```

#### GET /api/compat/govqa/reports/export

Export report in GovQA format.

**Query Parameters:**
- `format` - Export format: `csv` or `json` (default: csv)
- `from_date` - Start date
- `to_date` - End date

**Response (CSV):**
```csv
Case Number,Subject,Requester Name,Requester Email,Status,Created Date,Due Date,Close Date
GQ-2026-001,"Police budget records",John Doe,john@example.com,IN_PROGRESS,2026-03-15T10:00:00.000Z,2026-04-05T10:00:00.000Z,
```

### Migration Tracking Endpoint

#### GET /api/v1/foia/migration/compat-usage

Get migration tracking dashboard (Admin only).

**Auth:** foia_admin

**Response:**
```json
{
  "success": true,
  "data": {
    "total_compat_requests": 1250,
    "unique_integrations": 45,
    "endpoints_used": [
      {
        "endpoint": "/api/compat/govqa/cases",
        "call_count": 650,
        "last_used": "2026-03-16T11:00:00.000Z"
      },
      {
        "endpoint": "/api/compat/govqa/cases/:caseNumber",
        "call_count": 400,
        "last_used": "2026-03-16T10:45:00.000Z"
      }
    ],
    "migration_progress": "IN_PROGRESS"
  }
}
```

**Migration Progress Values:**
- `NOT_STARTED` - No compatibility requests yet
- `IN_PROGRESS` - Active usage in last 30 days
- `COMPLETE` - No usage in last 30 days (migration complete)

## Setup

### 1. Install Dependencies

```bash
cd modules/foia/ai-features/govqa-compat
npm install
```

### 2. Run Database Migration

```bash
psql -d your_database -f ../../migrations/022_govqa_compatibility.sql
```

### 3. Register Routes

```typescript
import { createGovQACompatRoutes } from '@govli/foia-govqa-compat';
import express from 'express';

const app = express();
const govqaRoutes = createGovQACompatRoutes();
app.use(govqaRoutes);
```

### 4. Migrate Existing GovQA Data

```sql
-- Mark existing GovQA records
UPDATE "FoiaRequests"
SET legacy_id = 'GQ-' || id,
    migration_source = 'govqa'
WHERE created_at < '2026-01-01'  -- Adjust date as needed
  AND legacy_id IS NULL;
```

## Usage Examples

### Updating Existing Integration

**Before (GovQA API):**
```javascript
const response = await fetch('https://govqa.agency.gov/api/cases', {
  method: 'POST',
  body: JSON.stringify({
    case_number: 'GQ-2026-001',
    subject: 'Request',
    // ... other fields
  })
});
```

**After (Govli Compatibility):**
```javascript
// Change only the base URL - everything else stays the same
const response = await fetch('https://govli.agency.gov/api/compat/govqa/cases', {
  method: 'POST',
  body: JSON.stringify({
    case_number: 'GQ-2026-001',
    subject: 'Request',
    // ... same fields
  })
});
```

### Checking Response Headers

```javascript
const response = await fetch('https://govli.agency.gov/api/compat/govqa/cases');

// Check if using compatibility layer
if (response.headers.get('X-Govli-Compat') === 'govqa') {
  const warning = response.headers.get('X-Govli-Migration-Warning');
  console.warn(warning);
  // "This endpoint is provided for GovQA migration compatibility.
  //  Please migrate to /api/v1/foia/* within 12 months."
}
```

## Migration Timeline

### Month 0-3: Compatibility Layer Active

- All GovQA integrations work without changes
- Compatibility requests logged for tracking
- Admin dashboard shows usage patterns

### Month 3-9: Gradual Migration

- Identify integrations using compatibility layer
- Update integrations to native Govli API one by one
- Monitor migration progress via dashboard

### Month 9-12: Final Migration

- Complete remaining integrations
- Verify no compatibility requests in last 30 days
- Migration status changes to "COMPLETE"

### Month 12+: Deprecation

- Compatibility layer can be safely removed
- All integrations using native Govli API

## Monitoring

### Track Migration Progress

```sql
-- Check migration status
SELECT * FROM "MigrationProgressByTenant";

-- See which endpoints are still being used
SELECT * FROM "CompatApiUsageSummary"
WHERE month >= DATE_TRUNC('month', NOW() - INTERVAL '3 months')
ORDER BY request_count DESC;

-- Identify recent compatibility usage
SELECT *
FROM "FoiaCompatRequests"
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Cleanup Old Logs

```sql
-- Remove logs older than 18 months
SELECT cleanup_old_compat_logs();
```

## Testing

Run tests:
```bash
npm test
```

**Test Coverage:**
- Field mapping accuracy (GovQA ↔ Govli)
- All compatibility endpoints
- Error handling and GovQA error format
- Migration tracking dashboard
- Status code mapping

## Security Considerations

- **Authentication**: All endpoints require same auth as native Govli API
- **Tenant Isolation**: All queries filtered by tenant_id
- **Audit Trail**: Every compatibility request logged
- **12-Month Window**: Forces migration to more secure native API

## Performance

### Request Overhead

- Field mapping: ~5-10ms per request
- Logging: ~20-50ms per request (async)
- Total overhead: < 100ms per request

### Optimization Tips

1. **Batch Operations**: Prefer list endpoints over individual lookups
2. **Caching**: Cache frequently accessed case data
3. **Async Logging**: Compatibility logs written asynchronously
4. **Index Usage**: Queries optimized with indexes on legacy_id

## Best Practices

### For Agencies

1. **Plan Migration Early**: Start migrating integrations within first 3 months
2. **Monitor Usage**: Use admin dashboard to track which integrations need updating
3. **Test Native API**: Test new integrations against `/api/v1/foia/*` endpoints
4. **Gradual Rollout**: Migrate one integration at a time

### For Developers

1. **Use Migration Dashboard**: Monitor `GET /api/v1/foia/migration/compat-usage`
2. **Set Alerts**: Alert when migration_progress is still "IN_PROGRESS" after 9 months
3. **Log Analysis**: Review compatibility logs to understand usage patterns
4. **Native API Preferred**: Always prefer native Govli API for new integrations

## Troubleshooting

### Case Not Found (404)

**Problem**: GET /api/compat/govqa/cases/GQ-001 returns 404

**Solution:**
```sql
-- Check if legacy_id is set
SELECT id, legacy_id, migration_source
FROM "FoiaRequests"
WHERE legacy_id = 'GQ-001' AND migration_source = 'govqa';

-- If empty, set legacy_id for migrated records
UPDATE "FoiaRequests"
SET legacy_id = 'GQ-001',
    migration_source = 'govqa'
WHERE id = 'actual-uuid-here';
```

### Field Mapping Issues

**Problem**: Some fields not mapping correctly

**Solution:** Check field mapping in `src/services/fieldMapper.ts` and adjust status/field maps as needed.

### Migration Progress Not Updating

**Problem**: Dashboard shows "IN_PROGRESS" but no recent requests

**Solution:**
```sql
-- Check for requests in last 30 days
SELECT COUNT(*)
FROM "FoiaCompatRequests"
WHERE tenant_id = 'your-tenant-id'
  AND created_at >= NOW() - INTERVAL '30 days';

-- If 0, migration is complete
```

---

**Built with**: PostgreSQL, TypeScript, Express.js
**Feature ID**: GovQA Compatibility Layer
**Status**: Production Ready
**Compatibility Window**: 12 months
