/**
 * Govli AI FOIA Module - Appeal Coach
 * AI-9: Appeal Coach
 */

export { default as appealCoachRoutes } from './routes';
export { setDatabasePool, analyzeAppeal, draftAppeal, getCoachSessions } from './handlers';
export { AppealAnalyzer } from './services/appealAnalyzer';
export { AppealDrafter } from './services/appealDrafter';
