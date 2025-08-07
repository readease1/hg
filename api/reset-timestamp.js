// Reset last checked timestamp for your wallet
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    const wallet = "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4";
    
    // Reset timestamp to 0 so it checks all recent transactions
    await storage.updateLastChecked(wallet, 0);
    
    return res.status(200).json({
      success: true,
      message: "Timestamp reset, should detect your previous claim on next monitor run"
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
