# AI-2: Autonomous Document Triage

AI-powered document classification and responsiveness analysis for FOIA requests.

## Features

### Core Capabilities
- **Automatic Classification**: 6 triage categories (LIKELY_RESPONSIVE, LIKELY_EXEMPT, PARTIALLY_RESPONSIVE, NOT_RESPONSIVE, NEEDS_REVIEW, SENSITIVE_CONTENT)
- **Confidence Scoring**: 0-1 confidence score for each classification
- **Smart Text Handling**: Intelligent truncation for large documents (>8000 chars → first 3000 + middle 1000 + last 1000)
- **Batch Processing**: Processes documents in groups of 10 to avoid API rate limits
- **Human Override**: FOIA officers can override AI decisions with audit logging
- **Event-Driven**: Automatically triggers on document upload events

### AI Analysis Includes
- Document responsiveness classification
- Exemption suggestions with FOIA codes
- PII/sensitive content detection
- Redaction recommendations
- Key findings extraction
- Redaction effort estimation

## API Endpoints

### POST /ai/triage/:foiaRequestId/run
Run triage analysis on documents for a FOIA request.

**Auth**: `foia_officer+` (manual) or `system` (auto-trigger)

**Request Body**:
```json
{
  "document_ids": ["uuid1", "uuid2"], // Optional: specific docs, omit for all
  "force_retriage": false // Optional: re-run even if already triaged
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "batch-id",
    "document_count": 15,
    "completed_count": 15,
    "failed_count": 0,
    "status": "COMPLETED",
    "avg_confidence": 0.82,
    "responsive_count": 10,
    "exempt_count": 3,
    "needs_review_count": 2
  }
}
```

### GET /ai/triage/:foiaRequestId/results
Get all triage results for a request, sorted by classification.

**Auth**: `foia_officer+`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "result-id",
      "document_id": "doc-id",
      "classification": "LIKELY_RESPONSIVE",
      "confidence_score": 0.85,
      "reasoning": "Document clearly relates to budget request",
      "key_findings": [...],
      "suggested_exemptions": [],
      "suggested_redactions": [],
      "estimated_redaction_effort": "NONE"
    }
  ]
}
```

### GET /ai/triage/document/:documentId
Get triage result for a specific document.

**Auth**: `foia_officer+`

### POST /ai/triage/document/:documentId/override
Override AI classification with human decision.

**Auth**: `foia_officer+`

**Request Body**:
```json
{
  "human_classification": "LIKELY_RESPONSIVE",
  "override_reason": "Officer reviewed - clearly responsive to request scope",
  "override_category": "POLICY_DECISION",
  "feedback_for_training": true
}
```

### GET /ai/triage/:foiaRequestId/summary
Get summary statistics for triage results.

**Auth**: `foia_officer+`

**Response**:
```json
{
  "success": true,
  "data": {
    "total_documents": 20,
    "triaged_documents": 18,
    "pending_documents": 2,
    "classification_breakdown": {
      "LIKELY_RESPONSIVE": 10,
      "LIKELY_EXEMPT": 3,
      "NEEDS_REVIEW": 5,
      ...
    },
    "avg_confidence": 0.78,
    "override_count": 2,
    "override_rate": 11.1
  }
}
```

### GET /ai/triage/batch/:batchId
Get batch run information.

**Auth**: `foia_officer+`

## Event Triggers

### Automatic Triage
Triage automatically runs when these events are emitted:

1. **`foia.document.package.ready`**
   - Triggered when: All documents in a request are uploaded and ready
   - Action: Runs triage on all untriaged documents in the request

2. **`foia.document.uploaded`**
   - Triggered when: A single document is uploaded
   - Action: Runs triage on that specific document

### Event Emission
After triage completes, emits:

**`foia.ai.triage.complete`**
```json
{
  "event_type": "foia.ai.triage.complete",
  "entity_id": "foia-request-id",
  "metadata": {
    "likely": 10,
    "possibly": 3,
    "review_needed": 5,
    "avg_confidence": 0.78,
    "total_documents": 18
  }
}
```

## Integration

### Register Event Handlers
```typescript
import { registerTriageEventHandlers } from '@govli/foia-triage';
import { eventBus } from '@govli/event-bus';
import { db } from './database';

// Register automatic triage triggers
registerTriageEventHandlers(eventBus, db);
```

### Manual Trigger
```typescript
import { TriageService } from '@govli/foia-triage';

const triageService = new TriageService(db);

// Run triage on all untriaged documents
await triageService.runTriageForRequest(
  tenant_id,
  foia_request_id,
  user_id
);
```

## Database Tables

### FoiaDocumentTriageResults
Stores AI analysis for each document:
- Classification, confidence, reasoning
- Key findings, sensitivity flags
- Exemption and redaction suggestions
- AI metadata (model, tokens, latency)
- Human review/override tracking

### FoiaDocumentTriageOverrides
Audit log of human overrides:
- AI vs human classification
- Override reason and category
- Feedback for training flag

### FoiaDocumentTriageBatches
Batch run tracking:
- Document counts, status
- Completion metrics
- Summary statistics

## Golden Rules Compliance

✅ **Rule #1**: Uses shared AI client (`getSharedAIClient()`)
✅ **Rule #2**: "JSON only" in system prompts
✅ **Rule #3**: Human-in-the-loop via override capability
✅ **Rule #4**: Audit events for all AI operations

## Smart Text Truncation

For documents > 8000 characters:
- First 3000 characters
- Middle 1000 characters (from center)
- Last 1000 characters

This ensures AI sees beginning (context), middle (body), and end (conclusions) without exceeding token limits.

## Rate Limiting

Processes documents in batches of 10 with 1-second delays between batches to avoid API rate limits.

## Testing

```bash
npm test          # Run Jest tests
npm run typecheck # TypeScript compilation check
```

## Configuration

Environment variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Database connection
- `ANTHROPIC_API_KEY`: Claude API key (via shared AI client)
- `TRIAGE_PORT`: Service port (default: 3011)
