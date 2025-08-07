// Fix existing users by storing their wallet addresses
export default async function handler(req, res) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    // Manually store wallet for abIenessy (we know this from earlier)
    const userData = {
      walletAddress: "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQBhC4",
      twitterUsername: "abIenessy",
      addedAt: new Date().toISOString()
    };

    await fetch(`${REDIS_URL}/set/user_data_abIenessy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(userData))
    });

    return res.status(200).json({
      success: true,
      message: "Fixed abIenessy with stored wallet",
      walletAddress: userData.walletAddress
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
