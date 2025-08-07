export default async function handler(req, res) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    // Get current tracked users
    const response = await fetch(`${REDIS_URL}/get/simple_tracked_users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    let users = JSON.parse(result.result);
    if (typeof users === 'string') users = JSON.parse(users);

    // Add wallet addresses to existing users
    const walletMap = {
      'abIenessy': 'A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQBhC4',
      'booleansolana': 'A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQBhC4',
      'samir_chebbo': 'Ba7S9Se73oeFR5ePhu9f1MoTP7b8xBdxTpz1eWBFBv2s'
    };

    // Update users with wallet addresses
    users = users.map(user => ({
      ...user,
      walletAddress: walletMap[user.twitterUsername] || null
    }));

    // Store updated users
    await fetch(`${REDIS_URL}/set/simple_tracked_users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(users)
    });

    return res.status(200).json({
      success: true,
      updatedUsers: users
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
