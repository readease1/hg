import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    const userId = "7259480190"; // Your Telegram user ID
    const username = "dev714"; // Your Telegram username  
    const chatId = 7259480190; // Your chat ID
    const targetUsername = "abIenessy"; // Username you want to track
    
    // Manually add the tracking
    const added = await storage.addTrackedUsername(userId, username, chatId, targetUsername);
    
    // Check if it worked
    const trackedUsernames = await storage.getAllTrackedUsernames();
    const userTracked = await storage.getUserTrackedUsernames(userId);
    
    return res.status(200).json({
      added: added,
      allTrackedUsernames: trackedUsernames,
      yourTrackedUsernames: userTracked,
      success: trackedUsernames.length > 0
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
