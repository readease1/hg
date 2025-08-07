// /api/setup-webhook.js - Set up Telegram webhook (run once)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  try {
    // Get the webhook URL (your domain + webhook endpoint)
    const webhookUrl = `${req.headers.origin || 'https://your-domain.vercel.app'}/api/telegram-webhook`;
    
    console.log(`Setting up webhook: ${webhookUrl}`);
    
    // Set the webhook
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    });

    const data = await response.json();
    
    if (data.ok) {
      // Get bot info
      const botInfoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const botInfo = await botInfoResponse.json();
      
      return res.status(200).json({
        success: true,
        message: 'Webhook set up successfully',
        webhookUrl: webhookUrl,
        botInfo: botInfo.result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: data.description || 'Failed to set webhook'
      });
    }
  } catch (error) {
    console.error('Setup webhook error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
