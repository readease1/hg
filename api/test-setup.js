// /api/test-setup.js - Simple test page to setup webhook
export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Show a simple HTML page with a button
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bot Setup</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          button { background: #7c77c6; color: white; padding: 15px 30px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; }
          button:hover { background: #6b66b5; }
          .result { margin-top: 20px; padding: 20px; background: #f5f5f5; border-radius: 8px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>Telegram Bot Setup</h1>
        <button onclick="setupWebhook()">Setup Webhook</button>
        <div id="result" class="result" style="display: none;"></div>
        
        <script>
          async function setupWebhook() {
            const button = document.querySelector('button');
            const result = document.getElementById('result');
            
            button.textContent = 'Setting up...';
            button.disabled = true;
            
            try {
              const response = await fetch('/api/setup-webhook', {
                method: 'POST'
              });
              
              const data = await response.json();
              result.textContent = JSON.stringify(data, null, 2);
              result.style.display = 'block';
              
              if (data.success) {
                button.textContent = 'Setup Complete!';
                button.style.background = '#22c55e';
              } else {
                button.textContent = 'Setup Failed';
                button.style.background = '#ef4444';
              }
            } catch (error) {
              result.textContent = 'Error: ' + error.message;
              result.style.display = 'block';
              button.textContent = 'Error';
              button.style.background = '#ef4444';
            }
          }
        </script>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  }
  
  return res.status(405).json({ error: 'Only GET allowed for this test page' });
}
