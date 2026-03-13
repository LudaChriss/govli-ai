# AI-7: Conversational Request Builder

**AI-powered conversational interface for building FOIA requests through natural dialogue**

## Overview

The Conversational Request Builder provides a friendly chat interface that guides citizens through building well-scoped FOIA requests. Using Claude AI, it asks clarifying questions, narrows broad requests, and generates complete request forms ready for submission.

### Key Features

- **Natural Conversation**: Grade 6 reading level, no legal jargon
- **3-5 Turn Completion**: Gathers all needed information efficiently
- **Smart Clarification**: Gently narrows overly broad requests
- **Quick-Reply Chips**: Suggested follow-up questions for faster interaction
- **Real-Time Validation**: Ensures complete requests before submission
- **Rate Limited**: 20 messages per session per IP per hour
- **Mobile Optimized**: Full-screen responsive chat interface
- **Accessible**: Keyboard navigable, screen reader compatible
- **Analytics Tracking**: Session metrics, completion rates, turn counts

## Architecture

### Backend Components

1. **ConversationService** (`src/services/conversationService.ts`)
   - Stateless conversation processing
   - Claude AI integration
   - Draft request generation
   - Analytics event emission

2. **Rate Limiter** (`src/middleware/rateLimiter.ts`)
   - In-memory rate limiting (Redis-ready)
   - Per-IP + per-session tracking
   - Auto-cleanup of expired windows

3. **API Routes** (`src/routes/convoBuilderRoutes.ts`)
   - POST /message - Process conversation messages
   - POST /session/start - Initialize new session
   - POST /session/:id/complete - Track completion
   - POST /draft/validate - Validate draft requests

### Frontend Components

4. **ConversationalRequestBuilder** (`portal/src/components/ConversationalRequestBuilder.tsx`)
   - Chat bubble UI (user right, AI left)
   - Branded AI messages (navy/teal gradient)
   - Suggested question chips
   - "Your Request is Ready" panel
   - Inline draft editing
   - Loading indicators

## API Endpoints

### POST /api/ai/convo-builder/message

Process a conversation message and return AI response.

**Auth**: PUBLIC (no authentication required)

**Request**:
```json
{
  "session_id": "uuid",
  "messages": [
    {
      "role": "user",
      "content": "I need police reports from last month"
    }
  ],
  "agency_context": {
    "agency_name": "City of Springfield",
    "departments": ["Police Department", "Fire Department"],
    "common_record_types": ["Police Reports", "Incident Reports", "Building Permits"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "I can help you with that! What specific incident or time period are you interested in?",
    "ready_to_submit": false,
    "suggested_follow_up_questions": [
      "All incidents in January",
      "A specific case number",
      "Incidents at a specific location"
    ],
    "session_id": "uuid",
    "message_count": 2
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**When Ready to Submit**:
```json
{
  "success": true,
  "data": {
    "message": "Perfect! I have all the details I need.",
    "ready_to_submit": true,
    "draft_request": {
      "description": "All traffic stop reports on Main Street during January 2024",
      "agencies": ["Police Department"],
      "date_range_start": "2024-01-01",
      "date_range_end": "2024-01-31",
      "format_preference": "electronic"
    },
    "session_id": "uuid",
    "message_count": 5
  }
}
```

**Rate Limit Headers**:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 2024-01-15T11:30:00Z
```

### POST /api/ai/convo-builder/session/start

Initialize a new conversation session.

**Response**:
```json
{
  "success": true,
  "data": {
    "session_id": "uuid"
  }
}
```

### POST /api/ai/convo-builder/session/:sessionId/complete

Track session completion for analytics.

**Request**:
```json
{
  "submitted": true,
  "message_count": 5
}
```

### POST /api/ai/convo-builder/draft/validate

Validate a draft request before submission.

**Request**:
```json
{
  "draft_request": {
    "description": "Police reports from January 2024",
    "agencies": ["Police Department"],
    "date_range_start": "2024-01-01",
    "date_range_end": "2024-01-31"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": []
  }
}
```

## Claude AI Integration

### System Prompt

The service uses a carefully crafted system prompt that:
- Sets friendly, helpful tone
- Specifies grade 6 reading level
- Defines 3-5 turn completion goal
- Lists required information to gather
- Provides JSON output format
- Includes agency context (departments, record types)

### Conversation Flow

**Turn 1**: Initial greeting + broad question
- "What records are you looking for?"
- Suggests common record types

**Turn 2-3**: Clarification questions
- Time range: "What dates?"
- Specificity: "Any particular incident or topic?"
- Department: "Which department would have these?"

**Turn 4-5**: Narrowing and confirmation
- Gently narrows overly broad requests
- Confirms understanding
- Generates draft request

**Output Format**:
```json
{
  "ready_to_submit": boolean,
  "message": "Friendly response text",
  "draft_request": {
    "description": "Complete description",
    "agencies": ["Department names"],
    "date_range_start": "YYYY-MM-DD",
    "date_range_end": "YYYY-MM-DD",
    "format_preference": "electronic|paper|either"
  },
  "suggested_follow_up_questions": ["Option 1", "Option 2", "Option 3"]
}
```

## Frontend Integration

### Basic Usage

```tsx
import ConversationalRequestBuilder from '@/components/ConversationalRequestBuilder';

function SubmitRequestPage() {
  const [mode, setMode] = useState<'chat' | 'form'>('chat');

  const handleRequestReady = (draft) => {
    console.log('Draft ready:', draft);
  };

  const handleSubmit = async (draft) => {
    await submitFOIARequest(draft);
  };

  return (
    <>
      {mode === 'chat' ? (
        <ConversationalRequestBuilder
          agencyContext={{
            agency_name: 'City of Springfield',
            departments: ['Police', 'Fire', 'Public Works'],
            common_record_types: ['Reports', 'Permits', 'Minutes']
          }}
          onRequestReady={handleRequestReady}
          onSubmit={handleSubmit}
          onModeSwitch={() => setMode('form')}
          apiBaseUrl="/api"
        />
      ) : (
        <TraditionalFormComponent />
      )}
    </>
  );
}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `agencyContext` | `AgencyContext` | Agency info for contextual prompts |
| `onRequestReady` | `(draft) => void` | Called when draft is ready |
| `onSubmit` | `(draft) => Promise<void>` | Called on final submission |
| `onModeSwitch` | `() => void` | Called when user wants form mode |
| `apiBaseUrl` | `string` | API base URL (default: `/api`) |

### Mode Toggle Implementation

```tsx
// At top of submit-request page
<div className="flex gap-4 mb-6">
  <button
    onClick={() => setMode('chat')}
    className={mode === 'chat' ? 'active' : ''}
  >
    💬 Chat with AI Guide
  </button>
  <button
    onClick={() => setMode('form')}
    className={mode === 'form' ? 'active' : ''}
  >
    📝 Fill Out Form
  </button>
</div>
```

### Cookie-Based Default Mode

```tsx
useEffect(() => {
  const isFirstVisit = !document.cookie.includes('foia_visited=true');
  if (isFirstVisit) {
    setMode('chat');
    document.cookie = 'foia_visited=true; max-age=31536000'; // 1 year
  } else {
    setMode('form'); // Returning users default to form
  }
}, []);
```

## Rate Limiting

**Limits**: 20 messages per session per IP per hour

**Behavior**:
- Independent tracking per IP + session combination
- Window resets after 1 hour
- 429 status code when exceeded
- Clear error message to user

**Production Recommendation**: Use Redis for distributed rate limiting:

```typescript
// Example Redis-based limiter
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function checkLimit(ip: string, sessionId: string): Promise<RateLimitResult> {
  const key = `ratelimit:${ip}:${sessionId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }

  const ttl = await redis.ttl(key);

  return {
    allowed: count <= 20,
    remaining: Math.max(0, 20 - count),
    reset_at: new Date(Date.now() + ttl * 1000)
  };
}
```

## Analytics & Monitoring

### Tracked Events

1. **session_started**: New conversation begins
2. **message_sent**: Each user/AI exchange
3. **draft_ready**: Request becomes ready to submit
4. **request_submitted**: User submits final request
5. **session_abandoned**: User leaves without submitting

### Key Metrics

- **Sessions Started**: Total conversations initiated
- **Completion Rate**: % of sessions that reach draft_ready
- **Submission Rate**: % of ready drafts actually submitted
- **Avg Turns to Completion**: Typical conversation length
- **Abandonment Points**: Where users drop off

### Event Structure

```json
{
  "id": "uuid",
  "tenant_id": "tenant-123",
  "event_type": "foia.ai.convo-builder.draft_ready",
  "entity_id": "session-uuid",
  "entity_type": "conversation_session",
  "metadata": {
    "session_id": "session-uuid",
    "message_count": 5,
    "response_time_ms": 1234,
    "ready_to_submit": true
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Testing

### Backend Tests

Run tests:
```bash
npm test modules/foia/ai-features/convo-builder/__tests__/convoBuilder.test.ts
```

**Coverage**:
- ✅ Process initial message and return AI response
- ✅ Recognize when request is ready to submit
- ✅ Handle AI response without JSON gracefully
- ✅ Enforce message count limits
- ✅ Handle AI client errors
- ✅ Validate complete draft requests
- ✅ Reject invalid drafts (short description, no agencies, bad dates)
- ✅ Rate limiter: allow within limit, block over limit
- ✅ Rate limiter: separate IP and session tracking
- ✅ Rate limiter: window reset after expiration

### Frontend Tests

Run tests:
```bash
cd modules/foia/portal && npm test -- ConversationalRequestBuilder
```

**Coverage**:
- ✅ Render chat interface
- ✅ Display initial AI greeting
- ✅ Render suggested quick-reply questions
- ✅ Send user message when form submitted
- ✅ Handle suggested question clicks
- ✅ Show loading indicator
- ✅ Display draft request panel when ready
- ✅ Allow editing draft request fields
- ✅ Submit final request
- ✅ Display API error messages
- ✅ Display rate limit errors
- ✅ Proper ARIA labels
- ✅ Keyboard navigation

## Best Practices

### For Citizens (UI Messaging)

1. **Be Specific**: Instead of "all emails," ask for "emails about the Main Street project from January 2024"
2. **Include Dates**: Specify a time range to help narrow the search
3. **One Topic at a Time**: Keep each request focused on a single subject

### For Agencies (Configuration)

1. **Agency Context**: Provide accurate department names and common record types
2. **Department List**: Keep updated with current organizational structure
3. **Record Types**: List 10-15 most commonly requested types

### For Developers

1. **Stateless Design**: Full message history sent each request (no server-side session storage)
2. **Error Handling**: Always provide friendly fallback messages
3. **Mobile First**: Test on small screens, use full viewport height
4. **Accessibility**: Maintain keyboard nav, screen reader labels, ARIA attributes

## Configuration

### Environment Variables

No environment variables required. Uses shared AI client from `@govli/foia-shared`.

### Service Options

```typescript
const conversationService = new ConversationService({
  model: 'claude-3-5-sonnet-20241022', // AI model to use
  max_messages_per_session: 50,        // Hard limit
  max_turns_before_completion: 10      // Soft guidance
});
```

### Rate Limiter Options

```typescript
const rateLimiter = new ConversationRateLimiter(
  20,           // max messages
  3600000       // window in ms (1 hour)
);
```

## Troubleshooting

### "Session not initialized"

**Cause**: Frontend couldn't start session
**Fix**: Check `/session/start` endpoint is accessible, check network tab for errors

### "Rate limit exceeded"

**Cause**: User sent >20 messages in 1 hour
**Fix**: Wait for window to reset (1 hour from first message)

### AI returns plain text instead of JSON

**Cause**: Claude didn't follow JSON format instruction
**Fix**: Service automatically handles this, treats as plain message with `ready_to_submit: false`

### Draft request missing fields

**Cause**: Conversation ended early or AI didn't gather all info
**Fix**: Validate draft before submission, prompt user to fill missing fields manually

### Mobile layout issues

**Cause**: Parent container constraints
**Fix**: Component expects full viewport height, ensure parent has `h-screen` or similar

## Roadmap

### Phase 2 Enhancements

- [ ] Multi-language support (Spanish, Chinese, etc.)
- [ ] Voice input for accessibility
- [ ] Saved draft recovery (localStorage)
- [ ] Conversation transcript download
- [ ] Advanced filtering suggestions based on agency records
- [ ] Integration with A-1 (Smart Deflection) for duplicate detection

### Performance Optimizations

- [ ] Redis-based rate limiting for multi-server deployments
- [ ] Streaming AI responses (token-by-token)
- [ ] Message history compression for long conversations
- [ ] CDN caching for common responses

## Support

- **Documentation**: See this README and inline code comments
- **Issues**: File on GitHub repository
- **Questions**: Contact FOIA module maintainers

---

**Built with**: Claude 3.5 Sonnet, React, Next.js, Tailwind CSS, TypeScript
**Feature ID**: AI-7
**Status**: Production Ready
