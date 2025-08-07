// Debug Redis sets
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Check what's in the tracked_wallets set
    const trackedWalletsRaw = await storage.smembers('tracked_wallets');
    
    // Try adding the wallet manually to see if it works
    const addResult = await storage.sadd('tracked_wallets', 'A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4');
    
    // Check again after manual add
    const trackedWalletsAfter = await storage.smembers('tracked_wallets');
    
    return res.status(200).json({
      trackedWalletsRaw,
      addResult,
      trackedWalletsAfter,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
