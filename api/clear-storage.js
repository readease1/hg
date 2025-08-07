// /api/clear-storage.js - Clear bad storage data
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Clear the corrupted data
    await storage.del('tracked_wallets');
    
    return res.status(200).json({
      success: true,
      message: 'Storage cleared, try tracking again'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
