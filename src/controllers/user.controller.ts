import { Response } from 'express';
import { saveUser, getUserByEmail, savePushToken, removePushToken, AppUser } from '../services/user.service';
import { AuthRequest } from '../middleware/auth.middleware';

// Create or update user
export const createOrUpdateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userData: AppUser = {
      email: req.user!.email!,
      name: req.body.name || req.user!.email!.split('@')[0],
      role: req.user!.role!,
      image: req.body.image || '',
      batch: req.body.batch,
      department: req.body.department,
    };

    const savedUser = await saveUser(userData);
    if (!savedUser) {
      return res.status(400).json({ success: false, message: 'Failed to save user' });
    }

    res.json({ success: true, user: savedUser });
  } catch (error) {
    console.error('❌ createOrUpdateUser error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user by email (authenticated user)
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const email = req.user!.email;
    const user = await getUserByEmail(email!);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ getMe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Save push token for user
export const savePushTokenHandler = async (req: AuthRequest, res: Response) => {
  try {
    const email = req.user!.email!;
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({ success: false, message: 'Push token is required' });
    }

    const success = await savePushToken(email, pushToken);

    if (!success) {
      return res.status(400).json({ success: false, message: 'Failed to save push token' });
    }

    res.json({ success: true, message: 'Push token saved successfully' });
  } catch (error) {
    console.error('❌ savePushToken error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Remove push token for user
export const removePushTokenHandler = async (req: AuthRequest, res: Response) => {
  try {
    const email = req.user!.email!;

    const success = await removePushToken(email);

    if (!success) {
      return res.status(400).json({ success: false, message: 'Failed to remove push token' });
    }

    res.json({ success: true, message: 'Push token removed successfully' });
  } catch (error) {
    console.error('❌ removePushToken error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
