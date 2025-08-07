// /api/debug-user.js - Debug user storage
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId parameter required' });
  }

  try {
    // Get user data directly
    const userKey = `user:${userId}`;
    const userData = await storage.get(userKey);
    
    // Get wallets using the function
    const wallets = await storage.getUserWallets(userId);
    
    return res.status(200).json({
      userId: userId,
      userKey: userKey,
      rawUserData: userData,
      walletsFromFunction: wallets,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
