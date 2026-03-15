# AI-14: Compliance Copilot

## Overview

The Compliance Copilot is a conversational AI assistant that provides jurisdiction-specific FOIA guidance to government officers. It combines statute knowledge, case law, and request context to offer real-time compliance advice, draft documents, and answer legal questions.

## Features

### Conversational AI Assistance

- **Jurisdiction-Specific Guidance**: Loads state statutes, exemptions, fee schedules, and routing rules
- **Request Context Awareness**: Automatically includes current request details in conversations
- **Smart Model Routing**:
  - Legal complexity keywords → Claude Sonnet 4.5 (higher accuracy)
  - Simple questions → Claude Haiku 4.5 (faster, cheaper)
- **Structured Responses**: Citations, suggested actions, and statute references
- **Session Persistence**: Conversations persist across page navigation

### Model Routing Logic

The copilot automatically detects complexity based on keywords:

| Keywords | Model | Reason |
|----------|-------|--------|
| litigation, vaughn, deliberative, injunction, in camera, exemption 5, foia lawsuit, court, appeal, privilege, redaction challenge, discovery | **Sonnet 4.5** | Complex legal questions require deeper analysis |
| All other questions | **Haiku 4.5** | Fast, cost-effective for routine queries |

### Quick Actions

1. **Check Exemption**: Paste text snippet → Get likely exemptions with confidence scores
2. **Draft Extension**: Provide reason → Get professionally drafted extension notice
3. **Explain Deadline**: Get business days remaining + statutory basis + extension availability

### Frontend Component

- **Collapsible Right Sidebar**: 320px wide panel
- **Chat Interface**: User messages (right, blue), copilot messages (left, white with Govli branding)
- **Citation Rendering**: Expandable accordion items for statute excerpts
- **Keyboard Shortcut**: `Ctrl+K` to focus input
- **Session Persistence**: Conversations survive page navigation via localStorage

## Architecture

### Backend Components

1. **CopilotService** (`src/services/copilotService.ts`)
   - `chat()` - Main conversation handler with model routing
   - `checkExemption()` - Quick exemption analysis
   - `draftExtension()` - Generate extension notices
   - `explainDeadline()` - Calculate deadline info
   - `loadJurisdictionKnowledge()` - Load statutes/exemptions
   - `loadRequestContext()` - Get current request details

2. **Handlers** (`src/handlers.ts`)
   - `sendMessage`: POST /ai/copilot/message
   - `getHistory`: GET /ai/copilot/history/:sessionId
   - `listSessions`: GET /ai/copilot/sessions
   - `checkExemption`: POST /ai/copilot/quick/check-exemption
   - `draftExtension`: POST /ai/copilot/quick/draft-extension
   - `explainDeadline`: POST /ai/copilot/quick/explain-deadline

3. **Frontend** (`frontend/CopilotPanel.tsx`)
   - React component with chat UI
   - Session management with localStorage
   - Quick action buttons
   - Citation/suggestion rendering

### Database Schema

**FoiaCopilotSessions:**
```sql
- id: UUID PK
- session_id: UUID UNIQUE
- tenant_id: UUID FK
- officer_id: VARCHAR(255)
- messages: JSONB (array of {role, content})
- model_used: VARCHAR(30) (last model: 'haiku' or 'sonnet')
- total_tokens: INTEGER
- total_cost: DECIMAL(10, 6) (USD)
- latency_ms: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

**FoiaTenants (modified):**
```sql
- jurisdiction_config: JSONB (statutes, exemptions, fee_schedule, routing_rules)
```

### Views

**CopilotUsageByOfficer:**
```sql
SELECT tenant_id, officer_id, session_count, total_messages,
       total_tokens, total_cost, haiku_sessions, sonnet_sessions
FROM CopilotUsageByOfficer
```

**CopilotUsageByMonth:**
```sql
SELECT tenant_id, month, session_count, total_messages,
       total_tokens, total_cost, unique_officers
FROM CopilotUsageByMonth
```

**CopilotModelDistribution:**
```sql
SELECT tenant_id, model_used, session_count, total_tokens,
       total_cost, avg_cost_per_session, avg_latency_ms
FROM CopilotModelDistribution
```

## API Endpoints

### POST /ai/copilot/message

Main chat endpoint for copilot conversations.

**Auth**: foia_officer+

**Request:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {"role": "user", "content": "What exemptions apply to personnel records?"}
  ],
  "context": {
    "foia_request_id": "uuid-optional",
    "current_screen": "request-detail",
    "officer_role": "foia_officer",
    "tenant_id": "uuid"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Under Texas law, personnel information is covered by § 552.221...",
    "citations": [
      {
        "statute": "§ 552.221",
        "text": "Information is excepted from disclosure if it is information in a personnel file..."
      }
    ],
    "suggested_actions": [
      "Review personnel file for exempt vs. non-exempt information",
      "Consider redacting employee evaluations and disciplinary records"
    ],
    "model_used": "haiku",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### GET /ai/copilot/history/:sessionId

Get conversation history for audit purposes.

**Auth**:
- Officers can view their own sessions
- Supervisors can view all sessions in their tenant

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "messages": [
      {"role": "user", "content": "What is FOIA?"},
      {"role": "assistant", "content": "FOIA is the Freedom of Information Act..."}
    ]
  }
}
```

### GET /ai/copilot/sessions

List all copilot sessions for this tenant.

**Auth**: foia_supervisor+

**Query Parameters:**
```
?officer_id=user-uuid
&date_from=2026-01-01
&date_to=2026-03-15
&model_used=sonnet
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "session_id": "uuid",
        "officer_id": "user-uuid",
        "message_count": 10,
        "model_used": "haiku",
        "total_tokens": 5000,
        "total_cost": 0.001250,
        "created_at": "2026-03-15T10:00:00Z",
        "updated_at": "2026-03-15T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

### POST /ai/copilot/quick/check-exemption

Quick action: Check likely exemptions for text snippet.

**Auth**: foia_officer+

**Request:**
```json
{
  "text_snippet": "Employee received written reprimand on 2023-05-15 for tardiness.",
  "tenant_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "likely_exemptions": [
      {
        "code": "§ 552.221",
        "confidence": 0.92,
        "reason": "Personnel evaluation and disciplinary records are exempt"
      },
      {
        "code": "§ 552.101",
        "confidence": 0.65,
        "reason": "May be considered confidential personnel information"
      }
    ]
  }
}
```

### POST /ai/copilot/quick/draft-extension

Quick action: Draft extension notice with statutory language.

**Auth**: foia_officer+

**Request:**
```json
{
  "foia_request_id": "uuid",
  "reason": "Large volume of records requires additional search time"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "extension_notice_text": "Dear [Requester],\n\nPursuant to § 552.221...",
    "new_deadline": "2026-04-15T00:00:00Z"
  }
}
```

### POST /ai/copilot/quick/explain-deadline

Quick action: Explain deadline calculation for request.

**Auth**: foia_officer+

**Request:**
```json
{
  "foia_request_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deadline": "2026-03-25T00:00:00Z",
    "business_days_remaining": 5,
    "statutory_basis": "§ 552.221 - Response deadline is 10 business days from receipt",
    "extension_available": true
  }
}
```

## Jurisdiction Knowledge

### Data Structure

Stored in `FoiaTenants.jurisdiction_config` JSONB column:

```json
{
  "state_name": "Texas",
  "statutes": [
    {
      "section": "§ 552.001",
      "title": "Policy; Construction",
      "text": "Public information is available to the public at a minimum..."
    }
  ],
  "exemptions": [
    {
      "code": "§ 552.101",
      "description": "Information confidential by law",
      "case_law": "See Texas Attorney General Opinion JC-0351"
    }
  ],
  "fee_schedule": {
    "per_page_copy": 0.10,
    "per_hour_search": 15.00,
    "minimum_fee": 0
  },
  "routing_rules": [
    "Requests for personnel records → HR department",
    "Requests involving litigation → Legal counsel review required"
  ]
}
```

### Prompt Caching

In production, jurisdiction knowledge should be cached using `promptCache` from `@govli/foia-ai-sidecar`:

```typescript
const cacheKey = `tenant:${tenantId}:copilot:jurisdiction`;
const jurisdiction = await promptCache.get(cacheKey);
```

## System Prompt

The copilot uses a jurisdiction-specific system prompt:

```
You are a FOIA compliance expert for [State Name]. You assist FOIA officers
with questions about processing public records requests.

RULES:
- Answer using [State]'s specific FOIA statutes ONLY
- Cite statute section numbers (e.g., § 552.003)
- If a question involves the current request, analyze its specific details
- Be concise: 2-4 sentences for simple questions
- For complex legal questions, provide balanced analysis
- Never give advice that contradicts this jurisdiction
- If you are unsure, say so explicitly
- Suggest concrete next actions when applicable
- ONLY return valid JSON with fields: message, citations, suggested_actions

JURISDICTION KNOWLEDGE:
[Statutes, exemptions, fee schedules, routing rules]

CURRENT REQUEST CONTEXT:
[Request details if foia_request_id provided]

RESPONSE FORMAT:
{
  "message": "Your response text here",
  "citations": [
    {"statute": "§ 552.003", "text": "Excerpt of relevant statute text"}
  ],
  "suggested_actions": ["Action 1", "Action 2"]
}
```

## Frontend Integration

### Basic Usage

```tsx
import { CopilotPanel } from '@govli/foia-compliance-copilot/frontend/CopilotPanel';

function AdminApp() {
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <>
      <AdminHeader onCopilotToggle={() => setCopilotOpen(!copilotOpen)} />

      <CopilotPanel
        isOpen={copilotOpen}
        onToggle={() => setCopilotOpen(!copilotOpen)}
        tenantId={currentUser.tenant_id}
        userId={currentUser.id}
        userRole={currentUser.role}
        currentScreen="request-detail"
        foiaRequestId={currentRequest?.id}
      />
    </>
  );
}
```

### Keyboard Shortcut

Users can press `Ctrl+K` to:
1. Open copilot panel (if closed)
2. Focus the input field

### Session Persistence

Sessions are stored in localStorage:
- Key: `copilot_session_id`
- Value: UUID
- Conversation history loaded on mount
- Survives page navigation within admin portal

## Database Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/019_compliance_copilot.sql
```

Creates:
- `FoiaCopilotSessions` table
- `jurisdiction_config` column on `FoiaTenants`
- `CopilotUsageByOfficer` view
- `CopilotUsageByMonth` view
- `CopilotModelDistribution` view

## Testing

Run tests:
```bash
cd modules/foia/ai-features/compliance-copilot
npm test
```

Test scenarios:
- Model routing (legal keywords → Sonnet)
- Jurisdiction knowledge loading
- Request context awareness
- Chat conversation flow
- Quick actions
- Session persistence
- Authorization checks

## Cost Analysis

### Model Pricing

| Model | Input | Output | Typical Use |
|-------|-------|--------|-------------|
| Haiku 4.5 | $0.25/1M | $1.25/1M | Simple questions, quick actions |
| Sonnet 4.5 | $3.00/1M | $15.00/1M | Complex legal questions |

### Example Costs

| Scenario | Model | Tokens | Cost |
|----------|-------|--------|------|
| Simple question | Haiku | 500 | $0.00025 |
| Complex legal analysis | Sonnet | 2000 | $0.006 |
| Quick exemption check | Haiku | 800 | $0.0004 |
| Draft extension notice | Haiku | 1200 | $0.0006 |

### Monthly Estimates

Assuming 100 officers, each using copilot 5 times/day:
- 15,000 queries/month
- 80% Haiku (12,000) + 20% Sonnet (3,000)
- Estimated cost: **$30-50/month**

## Best Practices

### For Agencies

1. **Populate Jurisdiction Knowledge**: Load your state's statutes and exemptions into `jurisdiction_config`
2. **Train Officers**: Show officers how to use quick actions for common tasks
3. **Monitor Usage**: Review `CopilotUsageByOfficer` to identify power users
4. **Audit Sessions**: Supervisors should spot-check copilot advice for accuracy

### For Developers

1. **Use Prompt Caching**: Implement promptCache to reduce costs and latency
2. **Tune Model Routing**: Adjust legal keywords list based on your jurisdiction
3. **Monitor Costs**: Track model distribution and optimize thresholds
4. **Validate JSON**: Always handle JSON parse errors gracefully

## Security Considerations

- **Access Control**: Only foia_officer+ can chat, supervisors can view all sessions
- **Tenant Isolation**: All queries filtered by tenant_id
- **Audit Trail**: All conversations logged in FoiaCopilotSessions
- **No PII in Logs**: Session logs contain only message text, no sensitive metadata

## Performance

### Latency

- **Haiku**: ~500-1000ms per query
- **Sonnet**: ~1500-3000ms per query
- **Jurisdiction Loading**: < 50ms (cached)
- **Request Context Loading**: < 100ms

### Scalability

- **Concurrent Sessions**: Unlimited (stateless service)
- **Database Growth**: ~1KB per conversation turn
- **Session Cleanup**: Recommend archiving sessions > 90 days old

## Metrics & Analytics

Track:
- **Model Distribution**: % of queries using Haiku vs. Sonnet
- **Cost per Officer**: Total tokens and cost by officer
- **Most Common Questions**: Analyze message content for patterns
- **Quick Action Usage**: Track check-exemption, draft-extension, explain-deadline usage

## Roadmap

### Phase 2 Enhancements

- [ ] Voice input/output for hands-free operation
- [ ] Multi-turn follow-up questions with context retention
- [ ] Integration with document assembly (auto-fill templates)
- [ ] Suggested redaction ranges based on exemption analysis
- [ ] Compliance scoring: rate officer decisions vs. copilot advice
- [ ] Training mode: quiz officers on FOIA scenarios

## Support

- **Documentation**: See README and inline code comments
- **Issues**: File on GitHub repository

---

**Built with**: Claude 3.5 Haiku, Claude 3.5 Sonnet, React, TypeScript
**Feature ID**: AI-14
**Status**: Production Ready
