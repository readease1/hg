// /api/monitor-wallets.js - Background monitoring for tracked wallets
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  // This endpoint should be called by a cron job every 30-60 seconds
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple authentication to prevent abuse
  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN || 'change-me-in-production';
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🔍 Starting wallet monitoring cycle...');
    
    const startTime = Date.now();
    const results = await monitorWallets();
    const endTime = Date.now();
    
    console.log(`✅ Monitoring completed in ${endTime - startTime}ms`);
    console.log(`📊 Results:`, results);

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
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  // Get all tracked wallets
  const trackedWallets = await storage.getAllTrackedWallets();
  console.log(`📋 Monitoring ${trackedWallets.length} wallets`);
  
  if (trackedWallets.length === 0) {
    return { walletsChecked: 0, alertsSent: 0, newClaims: 0 };
  }

  let walletsChecked = 0;
  let alertsSent = 0;
  let newClaims = 0;

  // Check each wallet for new fee claims
  for (const walletAddress of trackedWallets) {
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      
      const claims = await checkWalletForNewClaims(walletAddress);
      walletsChecked++;
      
      if (claims.length > 0) {
        console.log(`🎯 Found ${claims.length} new claims for ${walletAddress}`);
        newClaims += claims.length;
        
        // Get all users tracking this wallet
        const trackers = await storage.getWalletTrackers(walletAddress);
        
        // Send alert to each tracker
        for (const tracker of trackers) {
          for (const claim of claims) {
            const sent = await sendClaimAlert(tracker, walletAddress, claim, TELEGRAM_BOT_TOKEN);
            if (sent) alertsSent++;
          }
        }
      }
      
    } catch (error) {
      console.error(`Error checking wallet ${walletAddress}:`, error.message);
    }
  }

  return { walletsChecked, alertsSent, newClaims };
}

async function checkWalletForNewClaims(walletAddress) {
  const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
  const FEE_PROGRAM = 'FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi';
  
  // Use Helius RPC if available, otherwise free Solana RPC
  const rpcUrl = HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com';

  try {
    // Get last checked timestamp for this wallet
    const lastChecked = await storage.getLastChecked(walletAddress);
    const now = Math.floor(Date.now() / 1000);
    
    // Get recent transactions
    const signaturesResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { 
          limit: 20,
          before: null // Get most recent
        }]
      })
    });

    if (!signaturesResponse.ok) {
      throw new Error(`RPC failed: ${signaturesResponse.status}`);
    }

    const signaturesData = await signaturesResponse.json();
    const signatures = signaturesData?.result || [];
    
    const newClaims = [];
    
    for (const sig of signatures) {
      // Skip if we've already processed this transaction
      if (sig.blockTime <= lastChecked) {
        continue;
      }
      
      // Check if this transaction involves the fee program
      const txResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig.signature, { 
            encoding: 'json',
            maxSupportedTransactionVersion: 0
          }]
        })
      });

      if (!txResponse.ok) continue;
      
      const txData = await txResponse.json();
      const transaction = txData?.result?.transaction;
      const meta = txData?.result?.meta;
      
      if (!transaction || !meta || meta.err) continue;
      
      // Check if transaction involves fee program
      const accountKeys = transaction.message.accountKeys;
      const involvesFeeProgram = accountKeys.includes(FEE_PROGRAM) ||
        transaction.message.instructions.some(inst => 
          accountKeys[inst.programIdIndex] === FEE_PROGRAM
        );
      
      if (!involvesFeeProgram) continue;
      
      // Check for positive balance change (indicating a claim)
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
        // Find the token address
        let tokenAddress = null;
        for (const account of accountKeys) {
          if (account.length === 44 && account.endsWith('BAGS')) {
            tokenAddress = account;
            break;
          }
        }
        
        newClaims.push({
          signature: sig.signature,
          timestamp: sig.blockTime,
          tokenAddress: tokenAddress,
          blockTime: sig.blockTime
        });
      }
    }
    
    // Update last checked timestamp
    if (signatures.length > 0) {
      const latestTimestamp = Math.max(...signatures.map(s => s.blockTime || 0));
      await storage.updateLastChecked(walletAddress, latestTimestamp);
    }
    
    return newClaims;
    
  } catch (error) {
    console.error(`Error checking wallet ${walletAddress}:`, error);
    return [];
  }
}

async function sendClaimAlert(tracker, walletAddress, claim, botToken) {
  const shortWallet = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`;
  const shortToken = claim.tokenAddress ? 
    `${claim.tokenAddress.slice(0, 8)}...${claim.tokenAddress.slice(-8)}` : 
    'Unknown';
  
  const claimTime = new Date(claim.timestamp * 1000).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const message = `🚨 **Fee Claim Alert!**

💰 Wallet: \`${shortWallet}\`
🪙 Token: \`${shortToken}\`
⏰ Time: ${claimTime}

🔗 [View Transaction](https://solscan.io/tx/${claim.signature})
🔍 [View Wallet](https://solscan.io/account/${walletAddress})

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

    return response.ok;
  } catch (error) {
    console.error(`Error sending alert to ${tracker.username}:`, error);
    return false;
  }
}
