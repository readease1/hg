// Fix the tracking data
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Clear the corrupted set
    await storage.del('tracked_wallets');
    
    // Re-add your wallet properly
    const wallet = 'A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4';
    const addResult = await storage.sadd('tracked_wallets', wallet);
    
    // Check the result
    const trackedWallets = await storage.smembers('tracked_wallets');
    
    return res.status(200).json({
      cleared: true,
      addResult,
      trackedWallets,
      success: trackedWallets.includes(wallet)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
