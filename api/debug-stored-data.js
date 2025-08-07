export default async function handler(req, res) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    // Check what's stored for samir_chebbo
    const response = await fetch(`${REDIS_URL}/get/user_data_samir_chebbo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    return res.status(200).json({
      key: 'user_data_samir_chebbo',
      exists: response.ok,
      data: result.result
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
