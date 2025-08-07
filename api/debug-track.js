import { addTrackedUser } from './simple-monitor.js';

export default async function handler(req, res) {
  try {
    const { username, chatId, telegramUsername } = req.query;
    
    if (!username || !chatId || !telegramUsername) {
      return res.status(400).json({ 
        error: 'Missing parameters',
        required: 'username, chatId, telegramUsername'
      });
    }

    console.log('Testing addTrackedUser...');
    
    // Test the tracking function
    const result = await addTrackedUser(username, parseInt(chatId), telegramUsername);
    
    return res.status(200).json({
      success: true,
      added: result,
      username: username,
      chatId: chatId,
      telegramUsername: telegramUsername
    });
    
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
