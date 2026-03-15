// @govli/foia-transparency-dashboard
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * AI-16: Public Transparency Dashboard & Score
 *
 * Provides public transparency scoring and dashboards for FOIA agencies
 */

// Services
export { TransparencyService } from './services/transparencyService';

// Jobs
export { calculateAllScores, setupScoreCalculationJob } from './jobs/scoreCalculationJob';

// Handlers
export {
  calculateScores,
  getPublicDashboard,
  getEmbedWidget,
  getAdminDashboard,
  updateSettings
} from './handlers';

// Routes
export { createTransparencyRoutes } from './routes';
