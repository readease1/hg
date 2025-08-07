// Simple monitoring that actually works - No duplicate alerts
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN;
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get tracked users from storage instead of hardcoding
    const trackedUsers = await getTrackedUsers();

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
          // Check for new claims only
          const lastNotifiedClaims = await getLastNotifiedClaims(user.twitterUsername);
          const newClaims = activityData.allClaims.filter(claim => 
            !lastNotifiedClaims.includes(claim.address)
          );

          if (newClaims.length > 0) {
            claimsFound += newClaims.length;
            
            // Send alert for each new claim
            for (const claim of newClaims) {
              const sent = await sendAlert(user, walletData.wallet, claim, activityData);
              if (sent) alertsSent++;
            }
            
            // Update notified claims
            const allClaimAddresses = activityData.allClaims.map(c => c.address);
            await setLastNotifiedClaims(user.twitterUsername, allClaimAddresses);
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

async function sendAlert(user, wallet, claim, activityData) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-8)}`;
  const shortToken = claim.address ? `${claim.address.slice(0, 8)}...${claim.address.slice(-8)}` : 'Unknown';
  
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
🪙 Token: \`${shortToken}\`
⏰ Time: ${claimTime}

🔗 [View Transaction](https://solscan.io/tx/${claim.transaction})
🔍 [View Wallet](https://solscan.io/account/${wallet})

_Tracked for @${user.telegramUsername}_`;

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

// Simple storage using Redis (much simpler than before)
async function getTrackedUsers() {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${REDIS_URL}/get/simple_tracked_users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('Redis GET failed, returning empty array');
      return [];
    }

    const result = await response.json();
    console.log('Redis GET result:', result);
    
    let users = [];
    
    if (result.result && result.result !== null) {
      try {
        users = JSON.parse(result.result);
        // Ensure it's an array
        if (!Array.isArray(users)) {
          console.log('Users is not an array, resetting to empty array');
          users = [];
        }
      } catch (parseError) {
        console.log('JSON parse error:', parseError);
        users = [];
      }
    }
    
    console.log('Final users array:', users);
    return users;
    
  } catch (error) {
    console.error('Error getting tracked users:', error);
    return [];
  }
}

async function setTrackedUsers(users) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    await fetch(`${REDIS_URL}/set/simple_tracked_users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(users))
    });
  } catch (error) {
    console.error('Error setting tracked users:', error);
  }
}

async function getLastNotifiedClaims(username) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${REDIS_URL}/get/notified_${username}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return [];

    const result = await response.json();
    return result.result ? JSON.parse(result.result) : [];
  } catch (error) {
    console.error('Error getting notified claims:', error);
    return [];
  }
}

async function setLastNotifiedClaims(username, claimAddresses) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    await fetch(`${REDIS_URL}/set/notified_${username}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(claimAddresses))
    });
  } catch (error) {
    console.error('Error setting notified claims:', error);
  }
}

// Store user data with wallet address
async function storeUserData(username, userData) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    await fetch(`${REDIS_URL}/set/user_data_${username}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(userData))
    });
  } catch (error) {
    console.error('Error storing user data:', error);
  }
}

// Get stored user data (including wallet address)
async function getStoredUserData(username) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${REDIS_URL}/get/user_data_${username}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.result ? JSON.parse(result.result) : null;
  } catch (error) {
    console.error('Error getting stored user data:', error);
    return null;
  }
}

// Export function to add tracked user (for /track command) - NOW STORES WALLET
export async function addTrackedUser(twitterUsername, telegramChatId, telegramUsername) {
  try {
    // Get wallet address ONCE when tracking (only Bags API call needed!)
    console.log(`🔍 Looking up wallet for @${twitterUsername} to store permanently...`);
    
    const walletResponse = await fetch(`https://hg-beta.vercel.app/api/wallet?username=${encodeURIComponent(twitterUsername)}`);
    
    if (!walletResponse.ok) {
      console.log(`❌ Wallet lookup failed for @${twitterUsername}: ${walletResponse.status}`);
      return false;
    }
    
    const walletData = await walletResponse.json();
    
    if (!walletData.success) {
      console.log(`❌ No wallet found for @${twitterUsername}: ${walletData.error}`);
      return false;
    }
    
    const walletAddress = walletData.wallet;
    console.log(`✅ Found wallet for @${twitterUsername}: ${walletAddress} - storing permanently!`);
    
    // Store user data with wallet address
    await storeUserData(twitterUsername, {
      walletAddress: walletAddress,
      twitterUsername: twitterUsername,
      addedAt: new Date().toISOString()
    });
    
    const users = await getTrackedUsers();
    
    // Check if already tracking
    const exists = users.some(u => 
      u.twitterUsername === twitterUsername && u.telegramChatId === telegramChatId
    );
    
    if (exists) return false;
    
    users.push({
      twitterUsername,
      telegramChatId,
      telegramUsername,
      walletAddress: walletAddress // Store wallet in user record too
    });
    
    await setTrackedUsers(users);
    console.log(`✅ Successfully added @${twitterUsername} with stored wallet ${walletAddress}`);
    return true;
    
  } catch (error) {
    console.error('Error adding tracked user:', error);
    return false;
  }
}

// Export function to remove tracked user
export async function removeTrackedUser(twitterUsername, telegramChatId) {
  const users = await getTrackedUsers();
  const filteredUsers = users.filter(u => 
    !(u.twitterUsername === twitterUsername && u.telegramChatId === telegramChatId)
  );
  
  if (filteredUsers.length === users.length) return false;
  
  await setTrackedUsers(filteredUsers);
  return true;
}

// Export function to get user's tracked usernames
export async function getUserTrackedUsernames(telegramChatId) {
  const users = await getTrackedUsers();
  return users
    .filter(u => u.telegramChatId === telegramChatId)
    .map(u => u.twitterUsername);
}
