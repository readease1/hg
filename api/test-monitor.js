// /api/test-monitor.js - Test the monitoring manually (Updated for usernames)
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Get all tracked usernames (not wallets)
    const trackedUsernames = await storage.getAllTrackedUsernames();
    
    // Get stats - simplified for username tracking
    const stats = {
      totalUsers: 0, // Would need separate tracking
      totalUsernames: trackedUsernames.length,
      totalTracking: 0 // Would need separate tracking
    };
    
    return res.status(200).json({
      trackedUsernames: trackedUsernames,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
