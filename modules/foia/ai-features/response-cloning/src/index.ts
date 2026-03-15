/**
 * AI-15: Response Cloning Module
 *
 * One-click response cloning with AI-powered adaptation
 */

export { CloningService } from './services/cloningService';
export { CloneDetectionSubscriber, setupCloneDetectionSubscriber, triggerCloneDetection } from './events/cloneDetectionSubscriber';
export { setDatabasePool } from './handlers';
export { default as cloningRoutes } from './routes';
