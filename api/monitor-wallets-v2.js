// /api/monitor-wallets-v2.js - Updated monitoring using website logic
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple authentication
  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN || 'change-me-in-production';
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 Starting wallet monitoring cycle (v2 - using website logic)...');
    
    const startTime = Date.now();
    const results = await monitorWallets();
    const endTime = Date.now();
    
    console.log(`✅ Monitoring completed in ${endTime - startTime}ms`);

    return res.status(200).json({
      success: true,
      duration: endTime - startTime,
      ...results
    });
  } catch (error) {
    console.error('❌ Monitoring error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function monitorWallets() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  // Get all tracked usernames instead of wallet addresses
  const trackedUsernames = await storage.getAllTrackedUsernames();
  console.log(`📋 Monitoring ${trackedUsernames.length} usernames`);
  
  if (trackedUsernames.length === 0) {
    return { usernamesChecked: 0, alertsSent: 0, newClaims: 0 };
  }

  let usernamesChecked = 0;
  let alertsSent = 0;
  let newClaims = 0;

  // Check each username for new fee claims
  for (const username of trackedUsernames) {
    try {
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
      
      const claims = await checkUsernameForNewClaims(username);
      usernamesChecked++;
      
      if (claims.length > 0) {
        console.log(`🎯 Found ${claims.length} new claims for @${username}`);
        newClaims += claims.length;
        
        // Get all users tracking this username
        const trackers = await storage.getUsernameTrackers(username);
        
        // Send alert to each tracker
        for (const tracker of trackers) {
          for (const claim of claims) {
            const sent = await sendClaimAlert(tracker, username, claim, TELEGRAM_BOT_TOKEN);
            if (sent) alertsSent++;
          }
        }
      }
      
    } catch (error) {
      console.error(`Error checking username ${username}:`, error.message);
    }
  }

  return { usernamesChecked, alertsSent, newClaims };
}

async function checkUsernameForNewClaims(username) {
  try {
    console.log(`🔍 Checking @${username} using website logic...`);
    
    // Step 1: Get wallet address (same as website)
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://hg-beta.vercel.app';
    
    const walletResponse = await fetch(`${baseUrl}/api/wallet?username=${encodeURIComponent(username)}`);
    
    if (!walletResponse.ok) {
      console.log(`❌ Wallet lookup failed for @${username}: ${walletResponse.status}`);
      return [];
    }
    
    const walletData = await walletResponse.json();
    
    if (!walletData.success) {
      console.log(`❌ No wallet found for @${username}: ${walletData.error}`);
      return [];
    }
    
    const walletAddress = walletData.wallet;
    console.log(`✅ Found wallet for @${username}: ${walletAddress}`);
    
    // Step 2: Check for new claims using website logic
    const lastChecked = await storage.getLastCheckedForUsername(username);
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Only check if it's been at least 30 seconds since last check (avoid spam)
    if (currentTime - lastChecked < 30) {
      console.log(`⏭️ Skipping @${username} - checked too recently`);
      return [];
    }
    
    const activityResponse = await fetch(`${baseUrl}/api/activity?wallet=${encodeURIComponent(walletAddress)}&username=${encodeURIComponent(username)}`);
    
    if (!activityResponse.ok) {
      console.log(`❌ Activity check failed for @${username}: ${activityResponse.status}`);
      return [];
    }
    
    const activityData = await activityResponse.json();
    
    // Update last checked timestamp
    await storage.updateLastCheckedForUsername(username, currentTime);
    
    if (!activityData.hasInteracted || !activityData.allClaims) {
      console.log(`ℹ️ No claims found for @${username}`);
      return [];
    }
    
    // Check if these are new claims since our last check
    const newClaims = [];
    const lastNotifiedClaims = await storage.getLastNotifiedClaims(username);
    
    for (const claim of activityData.allClaims) {
      // If we haven't notified about this token address before, it's new
      if (!lastNotifiedClaims.includes(claim.address)) {
        newClaims.push({
          username: username,
          walletAddress: walletAddress,
          tokenAddress: claim.address,
          tokenName: claim.name || 'Unknown',
          transaction: claim.transaction,
          claimMetrics: activityData.claimMetrics
        });
      }
    }
    
    // Update the list of notified claims
    if (newClaims.length > 0) {
      const allTokenAddresses = activityData.allClaims.map(c => c.address);
      await storage.updateLastNotifiedClaims(username, allTokenAddresses);
    }
    
    console.log(`🎯 Found ${newClaims.length} NEW claims for @${username}`);
    return newClaims;
    
  } catch (error) {
    console.error(`Error checking username ${username}:`, error);
    return [];
  }
}

async function sendClaimAlert(tracker, username, claim, botToken) {
  const shortWallet = `${claim.walletAddress.slice(0, 8)}...${claim.walletAddress.slice(-8)}`;
  const shortToken = claim.tokenAddress ? 
    `${claim.tokenAddress.slice(0, 8)}...${claim.tokenAddress.slice(-8)}` : 
    'Unknown';
  
  // Format the claim time
  let claimTime = 'Recently';
  if (claim.claimMetrics && claim.claimMetrics.lastClaimDate) {
    const lastClaimDate = new Date(claim.claimMetrics.lastClaimDate);
    claimTime = lastClaimDate.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  const message = `🚨 **Fee Claim Alert!**

👤 User: @${username}
💰 Wallet: \`${shortWallet}\`
🪙 Token: \`${shortToken}\`
⏰ Time: ${claimTime}

🔗 [View Transaction](https://solscan.io/tx/${claim.transaction})
🔍 [View Wallet](https://solscan.io/account/${claim.walletAddress})

_Tracked for @${tracker.username}_`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tracker.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      })
    });

    const success = response.ok;
    if (success) {
      console.log(`✅ Alert sent to @${tracker.username} for @${username}`);
    } else {
      console.log(`❌ Failed to send alert to @${tracker.username}: ${response.status}`);
    }

    return success;
  } catch (error) {
    console.error(`Error sending alert to ${tracker.username}:`, error);
    return false;
  }
}
