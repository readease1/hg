export default async function handler(req, res) {
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'username parameter required' });
  }

  try {
    console.log(`Testing wallet lookup for @${username}`);
    
    // Step 1: Try to get wallet address using your website's working logic
    const walletResponse = await fetch(`https://hg-beta.vercel.app/api/wallet?username=${encodeURIComponent(username)}`);
    
    if (!walletResponse.ok) {
      return res.status(400).json({ 
        error: `Wallet lookup failed: ${walletResponse.status}`,
        username: username
      });
    }
    
    const walletData = await walletResponse.json();
    
    if (!walletData.success) {
      return res.status(404).json({
        error: `No wallet found for @${username}`,
        details: walletData.error,
        username: username
      });
    }
    
    // Step 2: Test activity check
    const activityResponse = await fetch(`https://hg-beta.vercel.app/api/activity?wallet=${encodeURIComponent(walletData.wallet)}&username=${encodeURIComponent(username)}`);
    const activityData = await activityResponse.json();
    
    return res.status(200).json({
      username: username,
      walletFound: true,
      wallet: walletData.wallet,
      hasActivity: activityData.hasInteracted,
      totalClaims: activityData.totalClaims || 0,
      canMonitor: true
    });
    
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      username: username
    });
  }
}
