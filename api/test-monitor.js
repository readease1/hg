// /api/test-monitor.js - Test the monitoring manually
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Get all tracked wallets
    const trackedWallets = await storage.getAllTrackedWallets();
    
    // Get stats
    const stats = await storage.getStats();
    
    return res.status(200).json({
      trackedWallets: trackedWallets,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
