// Test if we can detect your specific claim
export default async function handler(req, res) {
  try {
    const wallet = "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4";
    
    // Import the monitoring logic
    const { storage } = await import('./lib/storage.js');
    
    // Check if wallet is tracked
    const trackers = await storage.getWalletTrackers(wallet);
    const lastChecked = await storage.getLastChecked(wallet);
    
    return res.status(200).json({
      wallet: wallet,
      isTracked: trackers.length > 0,
      trackers: trackers,
      lastChecked: lastChecked,
      lastCheckedDate: new Date(lastChecked * 1000).toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
