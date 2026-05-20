import { Router } from 'express';
import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  initiateMFA,
  verifyMFA,
  initiatePasswordReset,
  resetPassword
} from './auth.controller';
import { validateRegistration, validateLogin } from './auth.validation';
import { initAuthMiddleware } from '../../middleware/auth';

// Initialize auth middleware
await initAuthMiddleware();

const authRouter = Router();

// Public routes (no authentication required)
authRouter.post('/register', validateRegistration, registerUser);
authRouter.post('/login', validateLogin, loginUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/forgot-password', initiatePasswordReset);
authRouter.post('/reset-password', resetPassword);

// MFA routes
authRouter.post('/mfa/initiate', initiateMFA);
authRouter.post('/mfa/verify', verifyMFA);

// Protected routes (authentication required)
// TODO: Add protected routes for user management, session management, etc.

export default authRouter;