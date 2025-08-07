// /api/telegram-webhook.js - Fixed version with no Markdown parsing issues
import { addTrackedUser, removeTrackedUser, getUserTrackedUsernames } from './simple-monitor.js';

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

  console.log(`📱 Message from @${username} (${userId}): ${text}`);

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
        await handleUntrackCommand(chatId, botToken, args, userId, username);
        break;
        
      case '/list':
        await handleListCommand(chatId, botToken, userId);
        break;
        
      case '/help':
        await sendHelpMessage(chatId, botToken);
        break;

      case '/whoami':
        await sendMessage(chatId, `Your Telegram User ID: ${userId}\nChat ID: ${chatId}\nUsername: @${username}`, botToken);
        break;
        
      default:
        await sendMessage(chatId, 'Unknown command. Use /help to see available commands.', botToken);
    }
  } else {
    await sendMessage(chatId, 'Send /help to see available commands.', botToken);
  }
}

async function sendStartMessage(chatId, botToken, username) {
  const message = `Welcome to Bags Fee Tracker, @${username}!

Track Twitter users and get instant alerts when they claim fees from Bags.fm tokens.

Commands:
/track <username> - Start tracking a Twitter user
/untrack <username> - Stop tracking a user  
/list - Show your tracked users
/help - Show this help message

Example:
/track dev714

Built by @devclaimbags | Visit devclaimbags.fm`;

  await sendMessage(chatId, message, botToken);
}

async function sendHelpMessage(chatId, botToken) {
  const message = `Bags Fee Tracker Commands

Tracking:
/track <username> - Start tracking Twitter user
/untrack <username> - Stop tracking user
/list - Show all your tracked users

Info:
/help - Show this help message

Examples:
/track dev714
/track abIenessy
/untrack dev714

Visit devclaimbags.fm for web interface`;

  await sendMessage(chatId, message, botToken);
}

async function handleTrackCommand(chatId, botToken, args, userId, username) {
  if (args.length === 0) {
    await sendMessage(chatId, 'Please provide a Twitter username.\n\nExample: /track dev714', botToken);
    return;
  }

  const targetUsername = args[0].replace('@', '');
  
  if (!isValidTwitterUsername(targetUsername)) {
    await sendMessage(chatId, 'Invalid Twitter username. Please check and try again.\n\nExample: /track dev714', botToken);
    return;
  }

  try {
    // Test if user exists in Bags system first
    const walletResponse = await fetch(`https://hg-beta.vercel.app/api/wallet?username=${targetUsername}`);
    
    if (!walletResponse.ok) {
      await sendMessage(chatId, `Unable to check @${targetUsername}. Please try again later.`, botToken);
      return;
    }
    
    const walletData = await walletResponse.json();
    
    if (!walletData.success) {
      await sendMessage(chatId, `@${targetUsername} not found in Bags system. They need to have created tokens on Bags.fm to be trackable.`, botToken);
      return;
    }

    const added = await addTrackedUser(targetUsername, chatId, username);
    
    if (added) {
      const shortWallet = `${walletData.wallet.slice(0, 8)}...${walletData.wallet.slice(-8)}`;
      await sendMessage(chatId, `Now tracking Twitter user: @${targetUsername}\n\nYou'll receive alerts when they claim fees!\n\nWallet: ${shortWallet}`, botToken);
    } else {
      await sendMessage(chatId, `Already tracking: @${targetUsername}`, botToken);
    }
  } catch (error) {
    console.error('Error adding username:', error);
    await sendMessage(chatId, 'Error adding username to tracking list. Please try again.', botToken);
  }
}

async function handleUntrackCommand(chatId, botToken, args, userId, username) {
  if (args.length === 0) {
    await sendMessage(chatId, 'Please provide a Twitter username to untrack.\n\nExample: /untrack dev714', botToken);
    return;
  }

  const targetUsername = args[0].replace('@', '');

  try {
    const removed = await removeTrackedUser(targetUsername, chatId);
    
    if (removed) {
      await sendMessage(chatId, `Stopped tracking: @${targetUsername}`, botToken);
    } else {
      await sendMessage(chatId, `@${targetUsername} not in your tracking list.`, botToken);
    }
  } catch (error) {
    console.error('Error removing username:', error);
    await sendMessage(chatId, 'Error removing username. Please try again.', botToken);
  }
}

async function handleListCommand(chatId, botToken, userId) {
  try {
    const usernames = await getUserTrackedUsernames(chatId);
    
    if (usernames.length === 0) {
      await sendMessage(chatId, 'You are not tracking any users yet.\n\nUse /track <username> to start tracking!', botToken);
      return;
    }

    let message = `Your Tracked Users (${usernames.length}):\n\n`;
    
    usernames.forEach((username, index) => {
      message += `${index + 1}. @${username}\n`;
    });
    
    message += `\nUse /untrack <username> to stop tracking.`;
    
    await sendMessage(chatId, message, botToken);
  } catch (error) {
    console.error('Error listing usernames:', error);
    await sendMessage(chatId, 'Error retrieving tracked users. Please try again.', botToken);
  }
}

async function sendMessage(chatId, text, botToken, options = {}) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
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

function isValidTwitterUsername(username) {
  return typeof username === 'string' && 
         username.length >= 1 && 
         username.length <= 15 && 
         /^[a-zA-Z0-9_]+$/.test(username);
}
