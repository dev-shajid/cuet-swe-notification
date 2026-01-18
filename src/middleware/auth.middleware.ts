import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { IAuthTokenPayload } from '../types';
import { clerkClient } from '@clerk/express';
import { getRole } from '../utils/role';
import { Student, Teacher } from '../models';

export interface AuthRequest extends Request {
  user?: IAuthTokenPayload;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication token missing',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    const clerkUser = await clerkClient.users.getUser(payload.sub);

    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress;

    if (!email) {
      res.status(401).json({
        success: false,
        message: 'Email not found for user',
      });
      return;
    }

    const role = getRole(email);
    if(!role) {
      res.status(403).json({
        success: false,
        message: 'User is not authorized',
      });
      return;
    }

    let userId;
    if(role=='teacher'){
      userId = (await Teacher.findOne({email}))?._id;
    }else{
      userId = (await Student.findOne({email}))?._id;
    }

    req.user = {
      userId,
      sessionId: payload.sid,
      email,
      role
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

export const requireRole = (role: 'student' | 'teacher') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized access',
      });
      return;
    }

    next();
  };
};
