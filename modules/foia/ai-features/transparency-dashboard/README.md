# AI-16: Public Transparency Dashboard & Score

## Overview

The Public Transparency Dashboard & Score system provides automated transparency scoring for FOIA agencies with optional public-facing dashboards and embeddable widgets for agency websites. Scores are calculated daily based on 5 key performance metrics.

## Features

### Transparency Score Algorithm (0-100 points)

**Component Breakdown:**
- **Response Time** (0-25 points): Based on median response days
  - < 5 days: 25 pts
  - < 10 days: 20 pts
  - < 15 days: 15 pts
  - < 20 days: 10 pts
  - < 30 days: 5 pts
  - ≥ 30 days: 0 pts

- **On-Time Rate** (0-25 points): % responses within statutory deadline
  - > 95%: 25 pts
  - > 85%: 20 pts
  - > 75%: 15 pts
  - > 65%: 10 pts
  - > 50%: 5 pts
  - ≤ 50%: 0 pts

- **Proactive Disclosure** (0-20 points): Reading room entries / total requests
  - > 20%: 20 pts
  - > 10%: 15 pts
  - > 5%: 10 pts
  - > 2%: 5 pts
  - ≤ 2%: 0 pts

- **Low Denial Rate** (0-15 points): Inverse of full denial %
  - < 5% denials: 15 pts
  - < 10%: 12 pts
  - < 15%: 9 pts
  - < 25%: 6 pts
  - < 40%: 3 pts
  - ≥ 40%: 0 pts

- **Low Appeal Reversal** (0-15 points): Inverse of appeal reversal %
  - < 5% reversed: 15 pts
  - < 10%: 12 pts
  - < 15%: 9 pts
  - < 25%: 6 pts
  - < 40%: 3 pts
  - ≥ 40%: 0 pts

### Peer Comparison

- Agencies are ranked within **state + size tier** cohorts
- Peer percentile calculated: % of peers with lower scores
- State and national averages provided for context

### Daily Score Calculation

- Automated cron job runs daily at 6 AM
- Analyzes last 12 months of data (rolling window)
- Stores historical scores for trend analysis

### Public-Facing Features

1. **Public Dashboard**: Citizen-accessible transparency overview
2. **Embeddable Widget**: iframe-friendly HTML for agency websites
3. **Opt-In Visibility**: Agencies control public visibility
4. **Admin Dashboard**: Internal view with peer comparison

## Architecture

### Backend Components

1. **TransparencyService** (`src/services/transparencyService.ts`)
   - `calculateScore(tenantId)` - Calculate 0-100 transparency score
   - `getPublicDashboard(agencySlug)` - Fetch public dashboard data
   - `setPublicVisibility(tenantId, isPublic)` - Toggle public access

2. **Score Calculation Job** (`src/jobs/scoreCalculationJob.ts`)
   - `calculateAllScores(db)` - Calculate for all enabled tenants
   - `setupScoreCalculationJob(db)` - Setup cron scheduler

3. **API Handlers** (`src/handlers.ts`)
   - `calculateScores` - Manual score calculation trigger
   - `getPublicDashboard` - Public dashboard endpoint
   - `getEmbedWidget` - Embeddable widget HTML
   - `getAdminDashboard` - Admin view with peer comparison
   - `updateSettings` - Toggle transparency settings

4. **Routes** (`src/routes.ts`)
   - Public routes (no auth)
   - Admin routes (foia_supervisor+ auth)

### Database Schema

**FoiaTransparencyScores:**
```sql
- id: UUID PK
- tenant_id: UUID FK
- score: INTEGER (0-100)
- components: JSONB
- peer_percentile: INTEGER (0-100)
- calculated_at: TIMESTAMP
```

**FoiaTenants (modified):**
```sql
- transparency_dashboard_enabled: BOOLEAN DEFAULT false
- transparency_public: BOOLEAN DEFAULT false
- slug: VARCHAR(255)
- state: VARCHAR(2)
- size_tier: VARCHAR(20)
```

**Views:**
- `TransparencyScoreHistory` - Historical scores with tenant info
- `TransparencyPeerRankings` - Rankings by state + size tier
- `TransparencyComponentBreakdown` - Component score analysis
- `TransparencyStateAverages` - State-level averages

## API Endpoints

### Public Endpoints (No Auth)

#### GET /public/transparency/:agencySlug

Get public transparency dashboard data.

**Response:**
```json
{
  "success": true,
  "data": {
    "agency_name": "Austin Police Department",
    "score": 85,
    "components": {
      "response_time": 20,
      "on_time_rate": 25,
      "proactive_disclosure": 15,
      "denial_rate": 12,
      "appeal_reversal": 13
    },
    "peer_percentile": 75,
    "monthly_stats": [...],
    "top_exemptions": [...],
    "reading_room_count": 150,
    "last_updated": "2026-03-15T06:00:00Z"
  }
}
```

#### GET /public/transparency/:agencySlug/embed

Get embeddable HTML widget.

**Response:** HTML page with inline styles (iframe-friendly)

### Admin Endpoints (Auth: foia_supervisor+)

#### POST /ai/transparency/calculate

Manually trigger score calculation.

**Request:**
```json
{
  "tenant_id": "uuid" // Optional: omit to calculate all
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant_id": "uuid",
    "score": 85,
    "components": {...},
    "peer_percentile": 75,
    "calculated_at": "2026-03-15T06:00:00Z"
  }
}
```

#### GET /api/v1/foia/transparency/admin

Get admin dashboard with peer comparison.

**Response:**
```json
{
  "success": true,
  "data": {
    "own_score": {
      "score": 85,
      "components": {...},
      "peer_percentile": 75,
      "calculated_at": "2026-03-15T06:00:00Z"
    },
    "peer_comparison": {
      "state": "TX",
      "size_tier": "MEDIUM",
      "state_average": 72,
      "national_average": 68,
      "peer_scores": [...]
    }
  }
}
```

#### PUT /api/v1/foia/transparency/settings

Update transparency dashboard settings.

**Request:**
```json
{
  "transparency_dashboard_enabled": true,
  "transparency_public": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Transparency settings updated successfully",
    "transparency_dashboard_enabled": true,
    "transparency_public": false
  }
}
```

## Frontend Components

### TransparencyDashboard (Public)

Public-facing dashboard component for citizen portal.

**Usage:**
```tsx
import { TransparencyDashboard } from '@govli/foia-transparency-dashboard/frontend';

<TransparencyDashboard
  agencySlug="austin-police-department"
  apiBaseUrl="https://api.example.com"
/>
```

**Features:**
- Score visualization with color-coded badge
- Component breakdown with progress bars
- Monthly performance trends table
- Top exemptions list
- Reading room statistics
- Embed code generator

### AdminDashboard (Internal)

Admin view with peer comparison and settings management.

**Usage:**
```tsx
import { AdminDashboard } from '@govli/foia-transparency-dashboard/frontend';

<AdminDashboard
  apiBaseUrl="https://api.example.com"
  authToken={userToken}
/>
```

**Features:**
- Own score vs state/national averages
- Component score breakdown
- Peer rankings table
- Manual score calculation trigger
- Public visibility toggle
- Dashboard enable/disable toggle

## Database Migration

Apply migration:
```bash
psql -d your_database -f modules/foia/migrations/021_transparency_dashboard.sql
```

**Creates:**
- `FoiaTransparencyScores` table
- Transparency columns on `FoiaTenants`
- 4 analytics views
- 2 helper functions
- Indexes for performance

## Setup

### 1. Install Dependencies

```bash
cd modules/foia/ai-features/transparency-dashboard
npm install
```

### 2. Run Database Migration

```bash
psql -d your_database -f ../../migrations/021_transparency_dashboard.sql
```

### 3. Setup Cron Job

```typescript
import { setupScoreCalculationJob } from '@govli/foia-transparency-dashboard';

// On app initialization
setupScoreCalculationJob(dbPool);
```

**Production Setup (using node-cron):**
```typescript
import cron from 'node-cron';
import { calculateAllScores } from '@govli/foia-transparency-dashboard';

// Run daily at 6 AM
cron.schedule('0 6 * * *', async () => {
  await calculateAllScores(dbPool);
});
```

### 4. Register Routes

```typescript
import { createTransparencyRoutes } from '@govli/foia-transparency-dashboard';
import express from 'express';

const app = express();
const transparencyRoutes = createTransparencyRoutes();
app.use(transparencyRoutes);
```

### 5. Enable for Tenant

```sql
UPDATE "FoiaTenants"
SET transparency_dashboard_enabled = true,
    transparency_public = false,  -- Set true to make public
    slug = 'agency-slug',
    state = 'TX',
    size_tier = 'MEDIUM'
WHERE id = 'your-tenant-id';
```

## Testing

Run tests:
```bash
npm test
```

**Test Coverage:**
- TransparencyService score calculation
- Public dashboard data retrieval
- Settings updates
- Handler error cases
- Public visibility controls

## Best Practices

### For Agencies

1. **Review Scores Before Going Public**: Ensure data quality before enabling `transparency_public`
2. **Monitor Component Breakdown**: Identify areas for improvement
3. **Track Peer Rankings**: Benchmark against similar agencies
4. **Use for Internal Improvement**: Even without public visibility, use scores to drive process improvements

### For Developers

1. **12-Month Rolling Window**: All metrics calculated from last 12 months
2. **Peer Grouping**: State + size tier ensures fair comparisons
3. **Opt-In Model**: Agencies must explicitly enable public visibility
4. **CORS Headers**: Public endpoints allow cross-origin requests
5. **Caching**: Consider caching public dashboard data (updates daily)

## Performance

### Calculation Speed

- Score calculation per tenant: ~500ms - 1s
- All tenants (100 agencies): ~1-2 minutes
- Runs daily at 6 AM (low-traffic period)

### Public Dashboard

- Query time: < 100ms (with proper indexes)
- Embeddable widget: < 200ms (HTML generation)
- Caching recommended for high-traffic sites

## Analytics & Insights

### Admin Insights

- **Component Trends**: Which components are improving/declining
- **Peer Position**: Rank among state + size tier cohort
- **State Average**: How your state compares nationally
- **National Average**: Overall FOIA transparency landscape

### System-Wide Analytics

Query views for insights:
```sql
-- State rankings
SELECT * FROM "TransparencyStateAverages" ORDER BY avg_score DESC;

-- Top performing agencies
SELECT * FROM "TransparencyPeerRankings" WHERE rank <= 10;

-- Component analysis
SELECT * FROM "TransparencyComponentBreakdown" ORDER BY total_score DESC;
```

## Security Considerations

- **Public Endpoints**: No auth required, but opt-in controlled
- **Admin Endpoints**: Require foia_supervisor+ role
- **Tenant Isolation**: All queries filtered by tenant_id
- **Audit Trail**: All score calculations logged with timestamps
- **CORS**: Public endpoints allow any origin (intentional)

## Roadmap

### Phase 2 Enhancements

- [ ] Historical trend charts (line graphs)
- [ ] Score improvement recommendations (AI-powered)
- [ ] Automated monthly reports to leadership
- [ ] Public leaderboards (opt-in)
- [ ] Integration with agency websites (WordPress plugin)
- [ ] Mobile-responsive embeddable widgets
- [ ] Score prediction based on current performance
- [ ] Anomaly detection for sudden score drops

---

**Built with**: PostgreSQL, TypeScript, React, Express.js
**Feature ID**: AI-16
**Status**: Production Ready
**Author**: Govli AI FOIA Build Guide v3
