// /api/monitor.js - Clean monitoring that never calls Bags API
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN;
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 Starting clean monitoring...');
    
    const results = await monitorWallets();
    
    return res.status(200).json({
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error('Monitor error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function monitorWallets() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  // Get all tracking data
  const trackings = await getAllTrackings();
  console.log(`📋 Found ${trackings.length} trackings`);
  
  if (trackings.length === 0) {
    return { walletsChecked: 0, alertsSent: 0, newClaims: 0 };
  }
  
  let walletsChecked = 0;
  let alertsSent = 0; 
  let newClaims = 0;
  
  // Group trackings by wallet (multiple users might track same wallet)
  const walletGroups = {};
  trackings.forEach(tracking => {
    if (!walletGroups[tracking.walletAddress]) {
      walletGroups[tracking.walletAddress] = [];
    }
    walletGroups[tracking.walletAddress].push(tracking);
  });
  
  // Check each unique wallet
  for (const walletAddress of Object.keys(walletGroups)) {
    try {
      walletsChecked++;
      console.log(`🔍 Checking wallet: ${walletAddress}`);
      
      // Check if this wallet has new claims (NEVER calls Bags API!)
      const claims = await checkWalletForClaims(walletAddress);
      
      if (claims.length > 0) {
        newClaims += claims.length;
        console.log(`🎯 Found ${claims.length} new claims for wallet ${walletAddress}`);
        
        // Send alerts to all users tracking this wallet
        const trackers = walletGroups[walletAddress];
        for (const tracker of trackers) {
          for (const claim of claims) {
            const sent = await sendAlert(tracker, claim, TELEGRAM_BOT_TOKEN);
            if (sent) alertsSent++;
          }
        }
      }
      
      // Small delay between wallet checks
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error checking wallet ${walletAddress}:`, error);
    }
  }
  
  return { walletsChecked, alertsSent, newClaims };
}

async function getAllTrackings() {
  // In production, you'd store tracking keys in a set
  // For now, return hardcoded trackings for testing
  return [
    {
      userId: 7259480190,
      username: "dev714",
      chatId: 7259480190,
      targetUsername: "samir_chebbo", 
      walletAddress: "Ba7S9Se73oeFR5ePhu9f1MoTP7b8xBdxTpz1eWBFBv2s"
    }
  ];
}

async function checkWalletForClaims(walletAddress) {
  const FEE_PROGRAM = 'FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi';
  
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  const rpcUrl = HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';

  try {
    // Get last checked timestamp
    const lastChecked = await getLastChecked(walletAddress);
    
    // Get recent signatures  
    const sigResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 20 }]
      })
    });
    
    const sigData = await sigResponse.json();
    const signatures = sigData?.result || [];
    
    const newClaims = [];
    
    // Check each signature for fee claims
    for (const sig of signatures) {
      // Skip if already checked
      if (sig.blockTime <= lastChecked) continue;
      
      // Get transaction details
      const txResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]
        })
      });
      
      const txData = await txResponse.json();
      const transaction = txData?.result?.transaction;
      const meta = txData?.result?.meta;
      
      if (!transaction || !meta || meta.err) continue;
      
      // CRITICAL: Check if wallet is signer & fee payer (like website does)
      const accountKeys = transaction.message.accountKeys;
      const firstAccount = accountKeys[0]; // Signer & fee payer
      
      if (firstAccount !== walletAddress) {
        // This wallet is not the signer - skip this transaction
        continue;
      }
      
      console.log(`✅ Wallet IS signer & fee payer in ${sig.signature}`);
      
      // Check if involves fee program
      const involvesFeeProgram = accountKeys.includes(FEE_PROGRAM) ||
        transaction.message.instructions.some(inst => 
          accountKeys[inst.programIdIndex] === FEE_PROGRAM
        );
      
      if (!involvesFeeProgram) continue;
      
      // Check for positive balance change
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      let hasPositiveChange = false;
      
      for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
        if (postBalances[i] > preBalances[i]) {
          hasPositiveChange = true;
          break;
        }
      }
      
      if (hasPositiveChange) {
        newClaims.push({
          signature: sig.signature,
          timestamp: sig.blockTime,
          walletAddress: walletAddress
        });
      }
    }
    
    // Update last checked
    if (signatures.length > 0) {
      const latestTimestamp = Math.max(...signatures.map(s => s.blockTime || 0));
      await setLastChecked(walletAddress, latestTimestamp);
    }
    
    return newClaims;
    
  } catch (error) {
    console.error(`Error checking wallet ${walletAddress}:`, error);
    return [];
  }
}

async function sendAlert(tracker, claim, botToken) {
  const shortWallet = `${claim.walletAddress.slice(0, 8)}...${claim.walletAddress.slice(-8)}`;
  const timeStr = new Date(claim.timestamp * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });

  const message = `🚨 Fee Claim Alert!

👤 User: @${tracker.targetUsername}
💰 Wallet: ${shortWallet}
⏰ Time: ${timeStr}

🔗 View Transaction: https://solscan.io/tx/${claim.signature}
🔍 View Wallet: https://solscan.io/account/${claim.walletAddress}

Tracked for @${tracker.username}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tracker.chatId,
        text: message
      })
    });

    const success = response.ok;
    if (success) {
      console.log(`✅ Alert sent to @${tracker.username} for @${tracker.targetUsername}`);
    }
    return success;
  } catch (error) {
    console.error('Send alert error:', error);
    return false;
  }
}

async function getLastChecked(walletAddress) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${REDIS_URL}/get/lastchecked_${walletAddress}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) return 0;
    const result = await response.json();
    return parseInt(result.result) || 0;
  } catch (error) {
    return 0;
  }
}

async function setLastChecked(walletAddress, timestamp) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    await fetch(`${REDIS_URL}/set/lastchecked_${walletAddress}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(timestamp)
    });
  } catch (error) {
    console.error('Set last checked error:', error);
  }
}
