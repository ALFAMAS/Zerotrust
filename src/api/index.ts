import { Router } from 'express';
import { authMiddleware, initAuthMiddleware } from '../middleware/auth';

// Initialize auth middleware
await initAuthMiddleware();

const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import route handlers
// TODO: Import authentication routes
// TODO: Import authorization routes
// TODO: Import user management routes

export default apiRouter;