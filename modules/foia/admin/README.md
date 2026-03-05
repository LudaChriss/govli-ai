# Govli AI - FOIA Admin Dashboard

A comprehensive React-based admin dashboard for managing FOIA requests with AI-powered features.

## Overview

This is the administrative interface for the Govli AI FOIA management platform. It provides FOIA officers with tools to manage requests, track compliance, leverage AI automation, and generate analytics.

## Features

### Core Pages (Fully Built)
- **Dashboard** - KPI cards, activity feed, SLA summary, workload forecast, AI cost tracking
- **Request List** - Advanced table with filtering, sorting, pagination, bulk actions (TanStack Table)
- **SLA Wall** - Full-screen countdown display for monitoring deadlines
- **AI Config** - Token budget management, model routing, feature toggles, accuracy metrics

### Placeholder Pages (Coming Soon)
All routes are scaffolded with "Coming Soon" placeholders that describe the planned functionality:

**Request Management:**
- Request Detail View
- Redaction Workbench
- Response Draft
- Consistency Check
- Vaughn Index Generator

**Analytics:**
- Analytics Overview
- Workload Prediction
- Pattern Intelligence
- Proactive Disclosure
- Transparency Dashboard

**Configuration:**
- Routing Rules
- Compliance Dashboard
- Migration Dashboard
- Fee Schedule Management
- Response Templates
- Jurisdiction Settings
- User Management
- Integrations
- Branding & Customization

## Tech Stack

- **React 18** with TypeScript
- **React Router** for navigation
- **TanStack Table** for data tables
- **TanStack Query** for data fetching
- **Recharts** for visualizations
- **Tailwind CSS** for styling
- **@govli/foia-ui** - Shared component library
- **Vite** for build tooling

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

### Development Server
The dev server runs at `http://localhost:5173` with API proxy configured to `http://localhost:3000/api/*`

## Project Structure

```
/Users/chrisleifel/Govli-AI-v2/modules/foia/admin/
├── index.html                    # Entry HTML
├── vite.config.ts                # Vite configuration
├── tsconfig.json                 # TypeScript config
├── tailwind.config.ts            # Tailwind config
├── postcss.config.js             # PostCSS config
├── package.json                  # Dependencies
└── src/
    ├── main.tsx                  # React app entry point
    ├── index.css                 # Global styles + Tailwind imports
    ├── router.tsx                # React Router configuration
    ├── layouts/
    │   └── AdminLayout.tsx       # Main app layout with sidebar, header, footer
    ├── components/
    │   └── CopilotPanel.tsx      # AI Copilot sidebar panel
    └── pages/
        ├── DashboardPage.tsx     # Main dashboard
        ├── RequestListPage.tsx   # Request table
        ├── SLAWallPage.tsx       # SLA countdown wall
        ├── AIConfigPage.tsx      # AI configuration
        └── [18 other pages...]   # Placeholder pages
```

## Layout Components

### AdminLayout
The main layout provides:
- **Left Sidebar:** Collapsible navigation menu with icons
- **Top Header:** Agency branding, user avatar, notifications, AI Copilot toggle
- **Main Content Area:** Router outlet for page content
- **Right Sidebar (Conditional):** AI Copilot panel
- **Footer:** Govli AI branding, version, support links

### CopilotPanel
AI Compliance Copilot features:
- Chat interface for AI assistance
- Suggested actions (review compliance, suggest redactions, etc.)
- Compliance warnings and alerts
- Contextual help based on current page

## UI Component Library

All UI components are imported from `@govli/foia-ui`:
- Button
- Badge
- Card
- Modal
- StatusBadge
- SLAIndicator
- Spinner

This ensures consistent styling across the admin dashboard and public portal.

## Configuration

### Path Aliases
- `@/*` maps to `src/*`

### API Proxy
In development, `/api/*` requests are proxied to `http://localhost:3000`

### Environment Variables
(To be added as needed)

## Key Features

### Dashboard
- 4 KPI cards with trend indicators
- Real-time activity feed
- SLA status summary with visual progress bars
- 30-day workload forecast chart
- AI cost tracking with budget utilization

### Request List
- Server-side pagination, sorting, filtering
- 11 columns including AI scoring and triage status
- Multi-select with bulk actions
- Search across all fields
- Filter by status, department, SLA urgency
- Click-through to request detail

### SLA Wall
- Full-screen display optimized for wall monitors
- Color-coded urgency (red/orange/yellow/green)
- Real-time countdown timers
- Auto-refresh every 60 seconds
- Progress bars for each request
- Fullscreen mode toggle

### AI Configuration
- Monthly token budget management
- Model routing by complexity tier (Simple/Complex/Expedited)
- Feature toggles for individual AI capabilities
- Accuracy metrics and override rate tracking
- 30-day cost history visualization
- Utilization alerts

## Mobile Responsive
All components use Tailwind responsive classes and are mobile-friendly.

## Accessibility
- ARIA labels on interactive elements
- Semantic HTML structure
- Keyboard navigation support
- Screen reader compatible

## Next Steps

1. **Install dependencies**: `npm install`
2. **Connect to backend API**: Update API endpoints in components
3. **Replace mock data**: Integrate with real backend services
4. **Implement WebSocket**: For real-time updates on SLA Wall
5. **Build placeholder pages**: Convert Coming Soon pages to full implementations
6. **Add authentication**: Integrate with auth provider
7. **Customize branding**: Update colors, logos, agency info

## Contributing

This is part of the Govli AI FOIA platform. For contribution guidelines, see the main project README.

## License

Proprietary - Govli AI

---

Built with Claude Code
