# AI-9: Appeal Coach

## Overview

The Appeal Coach helps members of the public understand FOIA denials and draft professional appeal letters. Using Claude AI, it provides honest assessments of exemption claims, suggests appeal grounds, and generates formal appeal letters.

## Features

- **AI-Powered Analysis**: Claude analyzes the agency's response and exemptions
- **Plain-English Explanations**: Grade 8 reading level explanations of exemptions
- **Honest Assessment**: Doesn't encourage frivolous appeals - tells it like it is
- **Appeal Ground Suggestions**: Specific arguments for challenging exemptions
- **Letter Drafting**: Generates formal, professional appeal letters
- **Rate Limiting**: 3 sessions per confirmation number to prevent abuse
- **Session Tracking**: Logs appeals filed through coach for staff prioritization
- **Public Access**: Available via confirmation number (no login required)

## Architecture

### Backend Components

1. **AppealAnalyzer Service** (`src/services/appealAnalyzer.ts`)
   - Fetches response data (public-safe fields only)
   - Calls Claude to analyze exemptions
   - Identifies appealable items
   - Provides honest assessment of success chances
   - Warns against frivolous appeals

2. **AppealDrafter Service** (`src/services/appealDrafter.ts`)
   - Calls Claude to draft formal appeal letters
   - Includes selected grounds and requester statement
   - Generates professional, grade 10 writing level letters
   - Provides template fallback if API unavailable

3. **Handlers** (`src/handlers.ts`)
   - `analyzeAppeal`: POST /ai/appeal-coach/analyze
   - `draftAppeal`: POST /ai/appeal-coach/draft-appeal
   - `getCoachSessions`: GET /ai/appeal-coach/sessions/:confirmationNumber

### Frontend Components

1. **Appeal Coach Wizard** (`frontend/js/appeal-coach.js`)
   - 5-step wizard interface
   - Step 1: Enter confirmation number
   - Step 2: View analysis
   - Step 3: Select appeal grounds
   - Step 4: Review/edit letter
   - Step 5: Submit appeal

### Database Tables

- **FoiaAppealCoachSessions**: Track sessions and rate limiting
- **FoiaRequests**: Added appeal tracking columns
- **FoiaDocuments**: Track exemptions and withheld documents

## API Endpoints

### POST /ai/appeal-coach/analyze

Analyze a FOIA response and provide appeal guidance.

**Auth**: Public (by confirmation number - delivered requests only)

**Request:**
```json
{
  "foia_request_id": "uuid",
  "confirmation_number": "FOIA-2025-00001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "exemption_plain_explanations": [
      {
        "code": "b(5)",
        "plain_explanation": "Attorney-client privileged communications and internal deliberations",
        "is_standard": true
      }
    ],
    "appealable_items": [
      {
        "document_title": "Email from Smith to Jones",
        "claim": "Withheld under exemption b(5)",
        "exemption_code": "b(5)",
        "suggested_appeal_ground": "The email appears to contain factual information rather than legal advice or deliberations...",
        "likelihood_of_success": "medium"
      }
    ],
    "overall_assessment": "Your appeal has moderate chances of success...",
    "expected_outcome": "If you appeal, you might receive...",
    "appeal_tips": [
      "Be specific about which documents you're challenging",
      "Reference the Freedom of Information Act's presumption of disclosure",
      "If applicable, argue that public interest outweighs the exemption"
    ],
    "should_appeal": true,
    "frivolous_risk": false
  }
}
```

**Rate Limiting**: 3 sessions per confirmation number within 7 days

**Error Responses**:
- 404: Request not found or not delivered
- 429: Rate limit exceeded (3 sessions)

### POST /ai/appeal-coach/draft-appeal

Draft a formal FOIA appeal letter.

**Auth**: Public (by confirmation number)

**Request:**
```json
{
  "foia_request_id": "uuid",
  "confirmation_number": "FOIA-2025-00001",
  "selected_grounds": [
    "The exemption b(5) appears overbroad as the email contains factual information",
    "The agency failed to conduct a line-by-line review for segregable information"
  ],
  "requester_statement": "I believe this information is in the public interest because..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "letter": "John Doe\njohn@example.com\n\nMarch 13, 2026\n\nAgency FOIA Appeals Office\n\nRe: Appeal of FOIA Request FOIA-2025-00001\n\nDear FOIA Appeals Officer:\n\nI am writing to appeal...",
    "subject_line": "Appeal of FOIA Request FOIA-2025-00001",
    "key_arguments": [
      "Exemption b(5) appears misapplied to factual information",
      "Segregability analysis was not performed"
    ],
    "suggested_edits": [
      "Consider adding specific examples of factual information that should be released",
      "Reference similar cases where b(5) was overturned for factual content"
    ]
  }
}
```

### GET /ai/appeal-coach/sessions/:confirmationNumber

Get session history and rate limit status.

**Auth**: Public

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid",
        "foia_request_id": "uuid",
        "created_at": "2026-03-13T10:30:00Z",
        "draft_generated": true
      }
    ],
    "total_sessions": 1,
    "sessions_remaining": 2,
    "rate_limit_reached": false
  }
}
```

## Claude AI Integration

### Analysis System Prompt

```
You are an advisor helping a member of the public understand a FOIA denial and decide whether to appeal. You have access to the agency's response letter and list of claimed exemptions.

Provide:
1. Plain-English explanation of what was withheld and why
2. An honest assessment of the exemption claims - are they standard and likely valid, or do any seem overbroad or worth challenging?
3. Specific appeal grounds they could raise for each challenged exemption, using plain language (not legalese)
4. What outcome they can realistically expect

Be honest - if the denial looks solid, say so. Do not encourage frivolous appeals. Use grade 8 reading level.
```

### Drafting System Prompt

```
You are a professional assistant helping a member of the public draft a formal FOIA appeal letter.

The letter should:
1. Reference the original request and response
2. Specifically identify each disputed exemption
3. Cite why each exemption is overbroad or misapplied
4. Request specific relief (release in full or in part)
5. Be professional and respectful in tone
6. Use grade 10 writing level (clear but formal)
```

## Exemption Categories

The Appeal Coach understands these common FOIA exemptions:

- **b(1)**: National security/classified information
- **b(2)**: Internal personnel rules and practices
- **b(3)**: Information protected by other federal laws
- **b(4)**: Confidential business information
- **b(5)**: Attorney-client privilege / deliberative process
- **b(6)**: Personal privacy
- **b(7)**: Law enforcement records
- **b(8)**: Financial institutions
- **b(9)**: Oil and gas wells

## Rate Limiting

- **Limit**: 3 sessions per confirmation number
- **Window**: 7 days
- **Purpose**: Prevent abuse while allowing legitimate iterative use
- **Exceeded**: Returns 429 error with helpful message

## Session Tracking

### What's Tracked

1. Session creation timestamp
2. Analysis result (JSONB)
3. Whether draft was generated
4. Whether appeal was submitted
5. Submission timestamp

### Staff Benefits

Requests with `appeal_coach_used = true` flag:
- Tend to be better scoped
- Have clearer arguments
- Are easier to process
- Can be prioritized differently

## Legal Disclaimers

The frontend **must** include prominent disclaimers:

1. **Not Legal Advice**:
   ```
   This is informational guidance, not legal advice. For complex cases,
   consider consulting an attorney.
   ```

2. **Free Legal Aid Resources**:
   - Link to local legal aid organizations
   - Link to FOIA advocacy groups
   - Link to pro bono attorney networks

3. **Right to Appeal**:
   ```
   You have the right to appeal even if the coach suggests limited chances
   of success. This analysis is meant to help you make an informed decision.
   ```

## Frontend Integration

### HTML Portal

```html
<!-- Include script -->
<script src="/js/appeal-coach.js"></script>

<!-- Appeal Coach container -->
<div id="appealCoachWizard">
  <!-- Step 1: Search -->
  <div id="step1">...</div>

  <!-- Step 2: Analysis -->
  <div id="step2" class="hidden">...</div>

  <!-- Step 3: Select Grounds -->
  <div id="step3" class="hidden">...</div>

  <!-- Step 4: Review Letter -->
  <div id="step4" class="hidden">...</div>

  <!-- Step 5: Submit -->
  <div id="step5" class="hidden">...</div>
</div>

<!-- Initialize -->
<script>
  document.addEventListener('DOMContentLoaded', initializeAppealCoach);
</script>
```

## Testing

Run tests:
```bash
cd modules/foia/ai-features/appeal-coach
npm test
```

Test scenarios:
- Full denial analysis
- Partial grant analysis
- Rate limiting enforcement
- Exemption explanations
- Appeal ground suggestions
- Frivolous appeal warnings
- Letter drafting
- Session tracking

## Database Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/015_appeal_coach.sql
```

Creates:
- `FoiaAppealCoachSessions` table
- `FoiaDocuments` table
- Appeal tracking columns in `FoiaRequests`
- Triggers for tracking

## Configuration

No additional configuration required. Uses:
- Shared AI client from `@govli/foia-shared`
- Existing database connection pool
- Standard Express middleware

## Best Practices

### For Agencies

1. **Respond to Appeals Promptly**: Track appeals from coach separately
2. **Monitor Trends**: Use session data to identify common issues
3. **Improve Responses**: If many appeals succeed, review denial practices
4. **Legal Review**: Have counsel review appeal coach guidance periodically

### For Developers

1. **Honest Assessment**: Never encourage frivolous appeals
2. **Plain Language**: Keep grade 8-10 reading level
3. **Error Handling**: Always provide fallback if Claude unavailable
4. **Privacy**: Never expose internal notes or exempt content
5. **Accessibility**: Ensure wizard works with screen readers

## Security Considerations

### Public Access

- Only delivered requests are eligible
- Only public-safe fields are exposed
- Confirmation number required (not just request ID)
- Rate limiting prevents abuse

### Data Protection

- No internal notes included in analysis
- No exempt content shown to requester
- Session logs don't contain sensitive data
- Appeal letters reviewed before submission

## Metrics & Analytics

Track:
- **Usage**: Sessions per month
- **Conversion**: % of sessions that draft letters
- **Submission**: % of drafts that get submitted
- **Success**: % of coach-assisted appeals that succeed
- **Quality**: Staff ratings of coach-assisted appeals

## Roadmap

### Phase 2 Enhancements

- [ ] Multi-language support
- [ ] Voice input for accessibility
- [ ] Citation of similar successful appeals
- [ ] Integration with pro bono attorney matching
- [ ] Automated appeal submission (agency permitting)
- [ ] Appeal tracking dashboard for requesters

### ML Improvements

- [ ] Train on successful appeal outcomes
- [ ] Predict success probability per exemption type
- [ ] Identify which exemptions are most often overturned
- [ ] Learn from staff feedback on appeal quality

## Support

- **Documentation**: See README and inline code comments
- **Issues**: File on GitHub repository
- **Legal Questions**: Contact FOIA ombudsman or legal aid

---

**Built with**: Claude 3.5 Sonnet, PostgreSQL, TypeScript, Vanilla JS
**Feature ID**: AI-9
**Status**: Production Ready
