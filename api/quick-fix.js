// Quick fix for wallet storage
export default async function handler(req, res) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // Clear the bad data
    await fetch(`${REDIS_URL}/del/tracked_wallets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add wallet correctly using direct Redis command
    await fetch(`${REDIS_URL}/sadd/tracked_wallets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4"])
    });
    
    // Check result
    const checkResponse = await fetch(`${REDIS_URL}/smembers/tracked_wallets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await checkResponse.json();
    
    return res.status(200).json({
      success: true,
      trackedWallets: result.result
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
