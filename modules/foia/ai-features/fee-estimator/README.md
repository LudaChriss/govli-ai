## AI-8: Real-Time Fee Estimator

**AI-powered fee estimation with ML-based search time prediction and plain-English explanations**

## Overview

The Real-Time Fee Estimator automatically calculates estimated fees for FOIA requests immediately after submission. Using ML models trained on historical cases and Claude AI for plain-English explanations, it provides transparent fee estimates that help requesters understand costs upfront.

### Key Features

- **Instant Estimates**: Generated automatically after request submission
- **ML-Powered**: Predicts search hours using historical case data
- **Category-Aware**: Different fee calculations for commercial, news media, educational, and general public requesters
- **Plain-English**: Claude generates friendly, grade 7 reading level explanations
- **Waiver Eligibility**: Automatic determination with application links
- **Accuracy Tracking**: Compares estimates to actual fees, improves over time
- **Breakdown View**: Expandable accordion showing search, review, and copy costs

## Architecture

### Fee Calculation Formula

**Commercial Requesters:**
```
Total = (search_hours × search_rate) + (review_hours × review_rate) + (pages × copy_rate)
```

**News Media / Educational / Scientific:**
```
Total = (pages beyond 100) × copy_rate
```
*No search or review fees*

**General Public:**
```
Total = (search_hours beyond 2) × search_rate + (pages beyond 100) × copy_rate
```
*First 2 hours search free, first 100 pages free*

### Search Hour Estimation

1. **ML Model** (if sufficient historical data):
   - Finds similar cases by record type, date range, volume
   - Calculates weighted average of actual search hours
   - Adjusts for estimated volume multiplier
   - Confidence: high (10+ cases), medium (3-9 cases)

2. **Fallback** (if insufficient data):
   - Base hours by volume: low (1.5h), moderate (3h), high (6h), very_high (12h)
   - Adjusts for date range: `hours × sqrt(date_range_years)`
   - Confidence: low

## Database Schema

### FoiaFeeSchedules

Agency-specific fee schedules and policies.

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `tenant_id` | Tenant identifier |
| `agency_id` | Agency identifier |
| `search_rate_per_hour` | Cost per hour of search (default: $25) |
| `review_rate_per_hour` | Cost per hour of review (default: $40) |
| `copy_rate_per_page` | Cost per page copied (default: $0.10) |
| `first_two_hours_free_general` | General public first 2 hours free |
| `first_100_pages_free_general` | General public first 100 pages free |
| `first_100_pages_free_media` | News media first 100 pages free |
| `commercial_review_required` | Commercial requests require review |
| `fee_waiver_threshold` | Auto-approve waiver below (default: $15) |
| `advance_payment_threshold` | Require notice above (default: $25) |

### FoiaFeeEstimates

AI-generated fee estimates for requests.

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `foia_request_id` | Request reference |
| `requester_category` | commercial, news_media, educational, general_public |
| `fee_estimate_low` | Lower bound estimate (75% of likely) |
| `fee_estimate_high` | Upper bound estimate (125% of likely) |
| `likely_fee` | Most probable fee amount |
| `likely_fee_waiver_eligible` | Waiver eligibility flag |
| `fee_breakdown` | JSONB: { search_hours, search_cost, review_hours, review_cost, estimated_pages, copy_cost, subtotal, exemptions_applied, total } |
| `plain_english_explanation` | Claude-generated friendly explanation |
| `waiver_application_url` | Link to apply for waiver (if eligible) |
| `estimation_confidence` | low, medium, high |
| `model_used` | ML model version or 'fallback' |
| `actual_fee` | Filled after case closes (for accuracy tracking) |
| `accuracy_percentage` | `(1 - |estimated - actual| / actual) × 100` |

### FoiaHistoricalFeeCases

Historical data for training ML models.

| Column | Description |
|--------|-------------|
| `record_type` | Type of records requested |
| `date_range_years` | Years covered by request |
| `requester_category` | Requester type |
| `actual_search_hours` | Actual time spent searching |
| `actual_pages` | Actual pages produced |
| `actual_fee` | Actual fee charged |
| `closed_at` | Case closure date |

## API Endpoints

### POST /api/ai/fees/estimate

Generate fee estimate for a FOIA request (called automatically after submission).

**Auth**: PUBLIC

**Request**:
```json
{
  "foia_request_id": "uuid",
  "description": "Police reports from January 2024 involving traffic stops on Main Street",
  "requester_category": "general_public",
  "agencies_requested": ["police-dept"],
  "date_range_years": 1,
  "estimated_record_volume": "moderate",
  "record_types": ["police reports", "incident reports"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fee_estimate_low": 37.50,
    "fee_estimate_high": 62.50,
    "likely_fee": 50.00,
    "likely_fee_waiver_eligible": true,
    "plain_english_explanation": "FOIA fees cover the cost of searching for, reviewing, and copying responsive records. Based on your request, we estimate fees will be approximately $50.00. Good news: you may qualify for a fee waiver or reduction based on your requester category (general_public). This is just an estimate - actual fees may vary based on the records found. You won't be charged without advance notice if fees exceed $25.",
    "fee_breakdown": {
      "search_hours": 3.0,
      "search_cost": 25.00,
      "estimated_pages": 150,
      "copy_cost": 5.00,
      "subtotal": 30.00,
      "exemptions_applied": [
        "First 2 hours of search free",
        "First 100 pages free"
      ],
      "total": 30.00
    },
    "waiver_application_url": "/apply-for-fee-waiver",
    "below_threshold": false,
    "advance_payment_required": true,
    "estimation_confidence": "medium"
  }
}
```

### GET /api/ai/fees/estimate/:foiaRequestId

Retrieve stored fee estimate.

**Auth**: PUBLIC (by confirmation number) or foia_coordinator+

**Response**:
```json
{
  "success": true,
  "data": {
    "fee_estimate_low": 37.50,
    "fee_estimate_high": 62.50,
    "likely_fee": 50.00,
    "likely_fee_waiver_eligible": true,
    "plain_english_explanation": "...",
    "fee_breakdown": {...},
    "waiver_application_url": "/apply-for-fee-waiver",
    "estimation_confidence": "medium",
    "estimated_at": "2024-01-15T10:30:00Z"
  }
}
```

### POST /api/ai/fees/track-actual/:foiaRequestId

Track actual fee for accuracy metrics (internal use).

**Auth**: foia_coordinator+

**Request**:
```json
{
  "actual_fee": 45.00,
  "actual_search_hours": 2.5,
  "actual_pages": 125
}
```

## Frontend Integration

### FeeEstimateCard Component

Display fee estimate on confirmation page:

```tsx
import FeeEstimateCard from '@/components/FeeEstimateCard';

function ConfirmationPage({ estimate }) {
  return (
    <div>
      <h1>Request Submitted Successfully!</h1>

      <FeeEstimateCard
        feeLow={estimate.fee_estimate_low}
        feeHigh={estimate.fee_estimate_high}
        likelyFee={estimate.likely_fee}
        waiverEligible={estimate.likely_fee_waiver_eligible}
        plainEnglishExplanation={estimate.plain_english_explanation}
        feeBreakdown={estimate.fee_breakdown}
        waiverApplicationUrl={estimate.waiver_application_url}
        belowThreshold={estimate.below_threshold}
        estimationConfidence={estimate.estimation_confidence}
      />
    </div>
  );
}
```

### Features

- **No Fees Banner**: Green checkmark when estimate below threshold ($15)
- **Fee Range**: Large, prominent display of low-high range
- **Waiver Banner**: Blue info banner for eligible requesters with "Apply" link
- **Plain-English**: Full explanation in grade 7 language
- **Breakdown Accordion**: Expandable detail view showing:
  - Search hours × rate
  - Review hours × rate (commercial only)
  - Pages × copy rate
  - Exemptions applied
  - Subtotal and total
- **Disclaimer**: Clear notice that actual fees may vary

## Claude AI Integration

### Plain-English Explanation Generation

**Model**: Claude 3.5 Sonnet

**System Prompt**:
```
You are a helpful government employee explaining FOIA fees to a member of the public.

Write a friendly, 4-6 sentence fee explanation. Explain:
1. Why there may be fees
2. What the estimated range is and what it covers
3. Whether they may qualify for a fee waiver based on their requester category
4. What happens next regarding fees

Use plain language, grade 7 reading level. Do not be legalistic.
Be transparent and reassuring. End with: "You won't be charged without advance notice if fees exceed $[threshold]."
```

**User Prompt**:
```
Requester category: general_public
Estimated fee: $50.00
Fee waiver eligible: Yes
Advance payment threshold: $25

Write a plain-English fee explanation.
```

**Fallback**: If Claude fails, service generates structured fallback explanation automatically.

## Accuracy Tracking

### Feedback Mechanism

When a case closes, FOIA coordinators track actual fees:

```typescript
await feeEstimatorService.trackActualFee(
  tenantId,
  foiaRequestId,
  actualFee,        // $45.00
  actualSearchHours, // 2.5
  actualPages       // 125
);
```

This:
1. Calculates accuracy percentage: `(1 - |estimated - actual| / actual) × 100`
2. Updates `FoiaFeeEstimates` with actual values
3. Adds case to `FoiaHistoricalFeeCases` for future ML training

### Metrics Dashboard

Track estimator performance over time:

```sql
SELECT
  COUNT(*) as total_estimates,
  AVG(accuracy_percentage) as avg_accuracy,
  SUM(CASE WHEN accuracy_percentage >= 75 THEN 1 ELSE 0 END) as within_25_percent,
  SUM(CASE WHEN likely_fee > actual_fee THEN 1 ELSE 0 END) as overestimates,
  SUM(CASE WHEN likely_fee < actual_fee THEN 1 ELSE 0 END) as underestimates
FROM "FoiaFeeEstimates"
WHERE accuracy_tracked = true;
```

## Testing

### Backend Tests

Run tests:
```bash
npm test modules/foia/ai-features/fee-estimator/__tests__/feeEstimator.test.ts
```

**Coverage**:
- ✅ Commercial requester fee calculation
- ✅ News media requester (first 100 pages free)
- ✅ Educational requester (pages under 100 free)
- ✅ General public requester (first 2 hours + 100 pages free)
- ✅ Waiver eligibility by category
- ✅ Auto-approval below threshold
- ✅ Complete fee estimate generation
- ✅ Fallback explanation on AI failure
- ✅ Accuracy tracking
- ✅ ML estimation with historical data
- ✅ Fallback when insufficient data

## Configuration

### Environment Variables

No environment variables required. Uses shared AI client from `@govli/foia-shared`.

### Fee Schedule Setup

Configure via admin interface or database:

```sql
INSERT INTO "FoiaFeeSchedules" (
  tenant_id,
  agency_id,
  agency_name,
  search_rate_per_hour,
  review_rate_per_hour,
  copy_rate_per_page,
  first_two_hours_free_general,
  first_100_pages_free_general,
  first_100_pages_free_media,
  commercial_review_required,
  fee_waiver_threshold,
  advance_payment_threshold
) VALUES (
  'city-of-springfield',
  'police-dept',
  'Springfield Police Department',
  30.00,  -- Search: $30/hour
  45.00,  -- Review: $45/hour
  0.15,   -- Copy: $0.15/page
  true,   -- General public: first 2 hours free
  true,   -- General public: first 100 pages free
  true,   -- News media: first 100 pages free
  true,   -- Commercial: review required
  20.00,  -- Auto-waiver below $20
  50.00   -- Advance notice above $50
);
```

## Best Practices

### For Agencies

1. **Update Fee Schedules**: Keep rates current, don't exceed federal maximums
2. **Track Actual Fees**: Always track after case closure to improve estimates
3. **Review Accuracy**: Monitor metrics monthly, retrain ML if accuracy drops
4. **Clear Thresholds**: Set reasonable auto-waiver and advance payment thresholds

### For Developers

1. **Async Estimation**: Call after request submission, don't block user flow
2. **Handle Failures**: Always provide fallback explanation if Claude fails
3. **Cache Schedules**: Minimize database queries for fee schedules
4. **Monitor Confidence**: Alert if many estimates have low confidence

## Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/014_fee_estimates.sql
```

Creates 4 tables with 15 indexes.

## Troubleshooting

### "No fee schedule found"

**Cause**: No schedule configured for agency
**Fix**: Insert default schedule or configure via admin interface

### Low estimation confidence

**Cause**: Insufficient historical data for ML model
**Fix**: Use manual estimates until 20+ cases accumulated, or adjust default hours

### Inaccurate estimates

**Cause**: Historical data doesn't match current processing times
**Fix**: Review recent cases, update base estimates, retrain ML model

### Claude explanation fails

**Cause**: AI service unavailable
**Fix**: Service automatically uses fallback explanation, no user impact

## Roadmap

### Phase 2 Enhancements

- [ ] Per-agency ML models (currently tenant-wide)
- [ ] Time-series forecasting for seasonal patterns
- [ ] Complex request detection (auto-increase estimates)
- [ ] Fee waiver auto-approval workflow
- [ ] Multi-language explanations
- [ ] PDF fee estimate download

### ML Improvements

- [ ] Neural network regression model (vs. simple averaging)
- [ ] Feature engineering: request complexity score, keyword analysis
- [ ] Ensemble methods: combine multiple models
- [ ] Online learning: update model as new cases close

## Support

- **Documentation**: See README and inline code comments
- **Issues**: File on GitHub repository
- **Questions**: Contact FOIA module maintainers

---

**Built with**: Claude 3.5 Sonnet, PostgreSQL, TypeScript, React, Tailwind CSS
**Feature ID**: AI-8
**Status**: Production Ready
