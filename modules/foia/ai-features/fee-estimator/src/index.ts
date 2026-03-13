/**
 * Govli AI FOIA Module - Fee Estimator
 * AI-8: Real-Time Fee Estimator
 */

export { default as feeEstimatorRoutes } from './routes';
export { setDatabasePool, estimateFee, getFeeEstimate, trackAccuracy } from './handlers';
export { FeeCalculator } from './services/feeCalculator';
export { ExplanationGenerator } from './services/explanationGenerator';
