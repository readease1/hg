// /api/telegram-webhook.js - Handle incoming Telegram messages
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  // Only accept POST requests from Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  try {
    const update = req.body;
    
    // Handle regular messages
    if (update.message) {
      await handleMessage(update.message, TELEGRAM_BOT_TOKEN);
    }
    
    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, TELEGRAM_BOT_TOKEN);
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

  console.log(`📱 Message from @${username} (${userId}): ${text}`);

  // Handle commands
  if (text.startsWith('/')) {
    const [command, ...args] = text.split(' ');
    
    switch (command) {
      case '/start':
        await sendStartMessage(chatId, botToken, username);
        break;
        
      case '/track':
        await handleTrackCommand(chatId, botToken, args, userId, username);
        break;
        
      case '/untrack':
        await handleUntrackCommand(chatId, botToken, args, userId);
        break;
        
      case '/list':
        await handleListCommand(chatId, botToken, userId);
        break;
        
      case '/help':
        await sendHelpMessage(chatId, botToken);
        break;

        case '/whoami':
  await sendMessage(chatId, `Your Telegram User ID: \`${userId}\`\nChat ID: \`${chatId}\`\nUsername: @${username}`, botToken);
  break;
        
      default:
        await sendMessage(chatId, '❓ Unknown command. Use /help to see available commands.', botToken);
    }
  } else {
    // Handle non-command messages
    await sendMessage(chatId, 'Send /help to see available commands.', botToken);
  }
}

async function sendStartMessage(chatId, botToken, username) {
  const message = `🎉 Welcome to Bags Fee Tracker, @${username}!

🔍 Track Solana wallet addresses and get instant alerts when they claim fees from Bags.fm tokens.

📋 **Commands:**
/track <wallet> - Start tracking a wallet
/untrack <wallet> - Stop tracking a wallet  
/list - Show your tracked wallets
/help - Show this help message

💡 **Example:**
\`/track 2FvFYLpFdAJnRbN2MC5QXYe975kki8L5SwN66SxyhBpx\`

🚀 Built by @devclaimbags | Visit devclaimbags.fm`;

  await sendMessage(chatId, message, botToken);
}

async function sendHelpMessage(chatId, botToken) {
  const message = `🆘 **Bags Fee Tracker Commands**

🔍 **Tracking:**
/track <wallet_address> - Start tracking wallet
/untrack <wallet_address> - Stop tracking wallet
/list - Show all your tracked wallets

📊 **Info:**
/help - Show this help message

💡 **Examples:**
\`/track 2FvFYLpFdAJnRbN2MC5QXYe975kki8L5SwN66SxyhBpx\`
\`/untrack 2FvFYLpFdAJnRbN2MC5QXYe975kki8L5SwN66SxyhBpx\`

🔗 Visit devclaimbags.fm for web interface`;

  await sendMessage(chatId, message, botToken);
}

async function handleTrackCommand(chatId, botToken, args, userId, username) {
  if (args.length === 0) {
    await sendMessage(chatId, '❌ Please provide a wallet address.\n\nExample: `/track 2FvFYLpFdAJnRbN2MC5QXYe975kki8L5SwN66SxyhBpx`', botToken);
    return;
  }

  const walletAddress = args[0];
  
  // Basic wallet address validation
  if (!isValidSolanaAddress(walletAddress)) {
    await sendMessage(chatId, '❌ Invalid Solana wallet address. Please check and try again.', botToken);
    return;
  }

  try {
    // Add wallet to user's tracking list
    const added = await storage.addTrackedWallet(userId, username, chatId, walletAddress);
    
    if (added) {
      await sendMessage(chatId, `✅ Now tracking wallet:\n\`${walletAddress}\`\n\nYou'll receive alerts when this wallet claims fees!`, botToken);
    } else {
      await sendMessage(chatId, `ℹ️ Already tracking wallet:\n\`${walletAddress}\``, botToken);
    }
  } catch (error) {
    console.error('Error adding wallet:', error);
    await sendMessage(chatId, '❌ Error adding wallet to tracking list. Please try again.', botToken);
  }
}

async function handleUntrackCommand(chatId, botToken, args, userId) {
  if (args.length === 0) {
    await sendMessage(chatId, '❌ Please provide a wallet address to untrack.\n\nExample: `/untrack 2FvFYLpFdAJnRbN2MC5QXYe975kki8L5SwN66SxyhBpx`', botToken);
    return;
  }

  const walletAddress = args[0];

  try {
    const removed = await storage.removeTrackedWallet(userId, walletAddress);
    
    if (removed) {
      await sendMessage(chatId, `✅ Stopped tracking wallet:\n\`${walletAddress}\``, botToken);
    } else {
      await sendMessage(chatId, `ℹ️ Wallet not in your tracking list:\n\`${walletAddress}\``, botToken);
    }
  } catch (error) {
    console.error('Error removing wallet:', error);
    await sendMessage(chatId, '❌ Error removing wallet from tracking list. Please try again.', botToken);
  }
}

async function handleListCommand(chatId, botToken, userId) {
  try {
    const userWallets = await storage.getUserWallets(userId);
    
    if (userWallets.length === 0) {
      await sendMessage(chatId, '📭 You are not tracking any wallets yet.\n\nUse /track <wallet> to start tracking!', botToken);
      return;
    }

    let message = `📋 **Your Tracked Wallets (${userWallets.length}):**\n\n`;
    
    userWallets.forEach((wallet, index) => {
      const shortAddress = `${wallet.slice(0, 8)}...${wallet.slice(-8)}`;
      message += `${index + 1}. \`${shortAddress}\`\n`;
    });
    
    message += `\nUse /untrack <wallet> to stop tracking a wallet.`;
    
    await sendMessage(chatId, message, botToken);
  } catch (error) {
    console.error('Error listing wallets:', error);
    await sendMessage(chatId, '❌ Error retrieving your tracked wallets. Please try again.', botToken);
  }
}

async function handleCallbackQuery(callbackQuery, botToken) {
  // Handle inline keyboard button clicks (for future features)
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  // Acknowledge the callback query
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQuery.id,
      text: 'Processing...'
    })
  });
}

async function sendMessage(chatId, text, botToken, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...options
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
    }

    return response.ok;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

function isValidSolanaAddress(address) {
  // Basic Solana address validation
  return typeof address === 'string' && 
         address.length >= 32 && 
         address.length <= 44 && 
         /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}
