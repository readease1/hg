// /api/telegram-webhook.js - Fixed telegram bot with working storage
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  try {
    const update = req.body;
    if (update.message) {
      await handleMessage(update.message, TELEGRAM_BOT_TOKEN);
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleMessage(message, botToken) {
  const chatId = message.chat.id;
  const text = message.text?.trim() || '';
  const userId = message.from.id;
  const username = message.from.username || 'Unknown';

  if (!text.startsWith('/')) {
    await sendMessage(chatId, 'Send /help to see available commands.', botToken);
    return;
  }

  const [command, ...args] = text.split(' ');
  
  switch (command) {
    case '/start':
    case '/help':
      await sendMessage(chatId, `Bags Fee Tracker Commands:

/track <username> - Track a Twitter user for fee claims
/list - Show your tracked users  
/untrack <username> - Stop tracking a user

Example: /track dev714`, botToken);
      break;
      
    case '/track':
      await handleTrack(chatId, botToken, args, userId, username);
      break;
      
    case '/list':
      await handleList(chatId, botToken, userId);
      break;
      
    case '/untrack':
      await handleUntrack(chatId, botToken, args, userId);
      break;
      
    default:
      await sendMessage(chatId, 'Unknown command. Use /help for available commands.', botToken);
  }
}

async function handleTrack(chatId, botToken, args, userId, username) {
  if (args.length === 0) {
    await sendMessage(chatId, 'Please provide a Twitter username.\n\nExample: /track dev714', botToken);
    return;
  }

  const targetUsername = args[0].replace('@', '');
  
  try {
    // Check if already tracking
    const currentTrackings = await getTrackings(userId);
    const alreadyTracking = currentTrackings.some(t => t.targetUsername === targetUsername);
    
    if (alreadyTracking) {
      await sendMessage(chatId, `You are already tracking @${targetUsername}`, botToken);
      return;
    }
    
    // Get wallet from your API
    const walletResponse = await fetch(`https://hg-beta.vercel.app/api/wallet?username=${targetUsername}`);
    const walletData = await walletResponse.json();
    
    if (!walletData.success) {
      await sendMessage(chatId, `@${targetUsername} not found in Bags system.`, botToken);
      return;
    }
    
    // Add to trackings
    const newTracking = {
      userId,
      username,
      chatId,
      targetUsername,
      walletAddress: walletData.wallet,
      addedAt: Date.now()
    };
    
    const updatedTrackings = [...currentTrackings, newTracking];
    await setTrackings(userId, updatedTrackings);
    
    const shortWallet = `${walletData.wallet.slice(0, 8)}...${walletData.wallet.slice(-8)}`;
    await sendMessage(chatId, `✅ Now tracking @${targetUsername}\nWallet: ${shortWallet}\n\nYou'll get alerts when they claim fees!`, botToken);
    
  } catch (error) {
    console.error('Track error:', error);
    await sendMessage(chatId, 'Error tracking user. Please try again.', botToken);
  }
}

async function handleList(chatId, botToken, userId) {
  try {
    const trackings = await getTrackings(userId);
    
    if (trackings.length === 0) {
      await sendMessage(chatId, 'You are not tracking anyone yet.\n\nUse /track <username> to start!', botToken);
      return;
    }
    
    let message = `📋 Your tracked users (${trackings.length}):\n\n`;
    trackings.forEach((tracking, index) => {
      // Show full wallet address in monospace for easy copying
      message += `${index + 1}. @${tracking.targetUsername}\n💰 \`${tracking.walletAddress}\`\n\n`;
    });
    
    await sendMessage(chatId, message, botToken);
  } catch (error) {
    console.error('List error:', error);
    await sendMessage(chatId, 'Error getting your tracked users.', botToken);
  }
}

async function handleUntrack(chatId, botToken, args, userId) {
  if (args.length === 0) {
    await sendMessage(chatId, 'Please provide a username to untrack.\n\nExample: /untrack dev714', botToken);
    return;
  }
  
  const targetUsername = args[0].replace('@', '');
  
  try {
    const currentTrackings = await getTrackings(userId);
    const filteredTrackings = currentTrackings.filter(t => t.targetUsername !== targetUsername);
    
    if (filteredTrackings.length === currentTrackings.length) {
      await sendMessage(chatId, `❌ You are not tracking @${targetUsername}`, botToken);
      return;
    }
    
    await setTrackings(userId, filteredTrackings);
    await sendMessage(chatId, `✅ Stopped tracking @${targetUsername}`, botToken);
    
  } catch (error) {
    console.error('Untrack error:', error);
    await sendMessage(chatId, 'Error removing tracking.', botToken);
  }
}

async function sendMessage(chatId, text, botToken) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Send message error:', error);
    return false;
  }
}

// FIXED: Unified storage system that actually works
async function getTrackings(userId) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    const response = await fetch(`${REDIS_URL}/get/user_trackings_${userId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`No trackings found for user ${userId}`);
      return [];
    }

    const result = await response.json();
    
    if (result.result && result.result !== null) {
      try {
        let trackings = result.result;
        
        // Handle potential double-encoding
        if (typeof trackings === 'string') {
          trackings = JSON.parse(trackings);
        }
        
        // Ensure it's an array
        if (Array.isArray(trackings)) {
          console.log(`Found ${trackings.length} trackings for user ${userId}`);
          return trackings;
        }
      } catch (parseError) {
        console.error('Error parsing trackings:', parseError);
      }
    }
    
    return [];
    
  } catch (error) {
    console.error('Error getting trackings:', error);
    return [];
  }
}

async function setTrackings(userId, trackings) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    console.log(`Storing ${trackings.length} trackings for user ${userId}`);

    const response = await fetch(`${REDIS_URL}/set/user_trackings_${userId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trackings) // Store as JSON directly
    });

    if (response.ok) {
      console.log(`✅ Successfully stored trackings for user ${userId}`);
    } else {
      console.error(`❌ Failed to store trackings: ${response.status}`);
    }
    
  } catch (error) {
    console.error('Error setting trackings:', error);
  }
}
