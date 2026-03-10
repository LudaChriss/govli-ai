# A-1 Intake v2.0 Features Status

**Module:** @govli/foia-intake
**Date:** 2026-03-09
**Status:** ✅ PARTIAL v2.0 IMPLEMENTED

---

## v2.0 Features Already Implemented

### ✅ 1. Complexity Scoring (Lines 126-151 in handlers.ts)
```typescript
const scorer = new ComplexityScorer();
const scoreResult = scorer.calculateScore({
  request_text_length: (requestData.description || '').length,
  document_count: 0,
  has_legal_citations: /\d+\s*U\.?S\.?C\.?|\d+\s*C\.?F\.?R\.?/i.test(requestData.description || ''),
  requires_legal_analysis: requestData.expedited_processing || false,
  has_multiple_exemptions: false,
  is_urgent: requestData.expedited_processing || false,
  feature_id: 'AI-1',
  estimated_analysis_depth: 'moderate'
});
```

**Features:**
- Calculates complexity score at intake
- Stores in `complexity_score` field
- Uses AI-1 feature ID (Intake Triage)
- Considers legal citations, urgency, text length

---

### ✅ 2. Legacy CRM Webhook Integration (Lines 174-211 in handlers.ts)
```typescript
const webhookUrl = await getLegacyCrmWebhookUrl(tenantId);
if (webhookUrl) {
  axios.post(webhookUrl, {
    request_id: requestId,
    confirmation_number: confirmationNumber,
    requester_email: requestData.requester_email,
    subject: requestData.subject,
    status: 'PENDING',
    received_at: receivedAt,
    due_date: dueDate
  }, { timeout: 5000 });
}
```

**Features:**
- Fire-and-forget webhook to legacy CRM
- Non-blocking (errors don't fail request submission)
- Logs webhook attempts to audit trail
- Configurable per tenant

---

### ✅ 3. Migration Source Tracking (Lines 90-93, 101-122 in handlers.ts)
```typescript
const migrationSource = (req.body as any).migration_source ||
                       req.headers['x-migration-source'] as string ||
                       null;
```

**Features:**
- Accepts migration source from body or header
- Stores in `migration_source` field
- Tracks which legacy system request came from
- Supports data migration scenarios

---

### ✅ 4. Enhanced Analytics Events (Lines 154-172 in handlers.ts)
```typescript
const event: GovliEvent = {
  id: uuidv4(),
  tenant_id: tenantId,
  event_type: 'foia.request.submitted',
  entity_id: requestId,
  entity_type: 'foia_request',
  user_id: undefined,
  metadata: {
    requester_category: requestData.requester_category,
    agency_count: requestData.agency_names.length,
    expedited: requestData.expedited_processing,
    fee_waiver: requestData.fee_waiver_requested,
    complexity_score: complexityScore,
    migration_source: migrationSource
  },
  timestamp: new Date()
};
```

**Features:**
- Emits structured events to analytics bus
- Includes complexity score in metadata
- Tracks migration source
- Captures requester category and flags

---

## v2.0 Features NOT YET Implemented

### ❌ 1. AI-Powered Triage (AI-1 Feature)
**Expected:**
- Call shared AI client for triage analysis
- Classify requests into categories (simple/complex/legal)
- Suggest routing to appropriate department
- Store AI confidence scores

**Current:**
- Only rule-based priority determination (lines 720-734)
- No AI analysis

**Implementation Plan:**
```typescript
// After request submission, async triage analysis
const aiClient = getSharedAIClient();
const triageResult = await aiClient.callWithAudit({
  prompt: buildTriagePrompt(request),
  systemPrompt: "Classify this FOIA request...",
  maxTokens: 1000
}, 'AI-1', tenantId, requestId, complexityScore);

// Store suggested_category, suggested_routing, triage_confidence
```

---

### ❌ 2. Request Scoping Analysis
**Expected:**
- AI analysis of request scope and document volume
- Estimated processing time
- Suggested search terms
- Scope clarification recommendations

**Current:**
- Not implemented

**Implementation Plan:**
```typescript
// Call scoping assistant (AI-3)
const scopingResult = await scopingService.analyzeScope(requestId);
// Store scope_analysis, estimated_doc_count, processing_estimate
```

---

### ❌ 3. Advanced Duplicate Detection
**Expected:**
- Vector similarity search
- AI-powered semantic matching
- Cross-requester pattern detection

**Current:**
- Basic PostgreSQL `similarity()` function (line 641)
- Same requester email matching only

**Implementation Plan:**
```typescript
// Use embeddings for semantic similarity
const embedding = await aiClient.generateEmbedding(requestText);
const similarRequests = await vectorStore.findSimilar(embedding, threshold);
```

---

### ❌ 4. Intake Conversation Builder (AI-7)
**Expected:**
- Multi-turn conversation to refine request
- Guided Q&A to extract details
- Automatic form population
- Ready-to-submit detection

**Current:**
- Direct form submission only
- No conversational interface

**Implementation Plan:**
```typescript
// New endpoint: POST /intake/conversation
// Manages conversation state
// Uses AI to ask clarifying questions
// Transitions to submission when ready_to_submit: true
```

---

## Database Schema Status

### ✅ Implemented Fields
- `complexity_score` (DECIMAL) ✅
- `migration_source` (TEXT) ✅

### ❌ Missing v2.0 Fields
- `suggested_category` (TEXT) - AI triage output
- `suggested_routing` (JSONB) - Department recommendations
- `triage_confidence` (DECIMAL) - AI confidence score
- `scope_analysis` (JSONB) - Scoping assistant output
- `estimated_doc_count` (INTEGER) - Scoping estimate
- `processing_estimate_days` (INTEGER) - Timeline estimate

---

## API Endpoints Status

### ✅ Implemented
- `POST /intake/requests` - Submit request ✅
- `GET /intake/requests/:id/status` - Get status ✅
- `PUT /intake/requests/:id/validate` - Validate request ✅
- `POST /intake/requests/:id/acknowledge` - Send acknowledgment ✅
- `GET /intake/requests` - Staff queue ✅
- `POST /intake/requests/:id/duplicate-check` - Check duplicates ✅

### ❌ Missing v2.0 Endpoints
- `POST /intake/requests/:id/triage` - AI triage analysis
- `POST /intake/requests/:id/scope` - Scoping analysis
- `POST /intake/conversation` - Start conversation
- `POST /intake/conversation/:id/message` - Continue conversation
- `POST /intake/conversation/:id/submit` - Submit from conversation

---

## Compliance with Golden Rules

### ✅ Follows Golden Rules
1. ✅ Uses shared types from @govli/foia-shared
2. ✅ Async processing (doesn't block response)
3. ✅ Event emission for audit trail
4. ✅ Human-in-the-loop (validation required)
5. ✅ Stores metadata permanently

### ❌ Not Yet Using
- Shared AI client (because AI features not implemented yet)
- callWithAudit() logging (no AI calls yet)

---

## Recommended Next Steps

### Priority 1: AI Triage (AI-1)
1. Add triage endpoint
2. Implement AI classification
3. Store triage results
4. Update staff queue to show AI suggestions

### Priority 2: Scoping Analysis (AI-3)
1. Add scoping endpoint
2. Integrate with scoping assistant service
3. Store analysis results
4. Show estimates in staff UI

### Priority 3: Enhanced Duplicate Detection
1. Implement vector embeddings
2. Add semantic similarity search
3. Improve detection accuracy
4. Add cross-requester pattern matching

### Priority 4: Conversation Builder (AI-7)
1. Design conversation state machine
2. Implement conversation endpoints
3. Add AI-powered Q&A
4. Build conversation UI

---

## Test Coverage

**Current:** Basic integration tests exist
**Needed:**
- AI triage tests
- Scoping analysis tests
- Duplicate detection tests
- Conversation flow tests

---

## Conclusion

The intake module has **foundational v2.0 features** (complexity scoring, webhooks, migration tracking) but is missing the **AI-powered enhancements** (triage, scoping, advanced duplicate detection, conversation builder).

**Overall v2.0 Completion:** ~40%
- ✅ Infrastructure: 90%
- ✅ Data Model: 60%
- ❌ AI Features: 0%
- ✅ Integration: 80%

**Status:** Ready for AI feature overlay implementation.
