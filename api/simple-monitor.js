// Simple monitoring that actually works
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN;
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Hardcode what you want to track for now
    const trackedUsers = [
      {
        twitterUsername: "abIenessy",
        telegramChatId: 7259480190, // Your chat ID
        telegramUsername: "dev714"
      }
      // Add more users here as needed
    ];

    let alertsSent = 0;
    let claimsFound = 0;

    for (const user of trackedUsers) {
      try {
        // Use your working website logic
        const walletResponse = await fetch(`https://hg-beta.vercel.app/api/wallet?username=${user.twitterUsername}`);
        
        if (!walletResponse.ok) continue;
        
        const walletData = await walletResponse.json();
        if (!walletData.success) continue;

        const activityResponse = await fetch(`https://hg-beta.vercel.app/api/activity?wallet=${walletData.wallet}&username=${user.twitterUsername}`);
        
        if (!activityResponse.ok) continue;
        
        const activityData = await activityResponse.json();

        if (activityData.hasInteracted && activityData.allClaims) {
          // Check if this is a new claim (simple timestamp check)
          const lastNotified = await getLastNotified(user.twitterUsername);
          const latestClaimTime = activityData.claimMetrics?.lastClaimDate ? 
            new Date(activityData.claimMetrics.lastClaimDate).getTime() : 0;

          if (latestClaimTime > lastNotified) {
            // New claim found!
            claimsFound++;
            
            const sent = await sendAlert(user, walletData.wallet, activityData);
            if (sent) {
              alertsSent++;
              await setLastNotified(user.twitterUsername, latestClaimTime);
            }
          }
        }
      } catch (error) {
        console.error(`Error checking ${user.twitterUsername}:`, error.message);
      }
    }

    return res.status(200).json({
      success: true,
      usersChecked: trackedUsers.length,
      claimsFound,
      alertsSent
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function sendAlert(user, wallet, activityData) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-8)}`;
  const claimTime = activityData.claimMetrics?.lastClaimDate ? 
    new Date(activityData.claimMetrics.lastClaimDate).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short', 
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) : 'Recently';

  const message = `🚨 **Fee Claim Alert!**

👤 User: @${user.twitterUsername}
💰 Wallet: \`${shortWallet}\`
🪙 Tokens: ${activityData.totalClaims} claimed
⏰ Time: ${claimTime}

🔗 [View Wallet](https://solscan.io/account/${wallet})

_Simple monitoring works!_`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Error sending alert:', error);
    return false;
  }
}

// Simple timestamp storage using environment or fallback
async function getLastNotified(username) {
  // For now, just return 0 to catch all claims
  // In production, you'd store this somewhere simple
  return 0;
}

async function setLastNotified(username, timestamp) {
  // For now, do nothing
  // In production, you'd store this somewhere simple
  return true;
}
