// Fix all existing tracked users by storing their wallet addresses
export default async function handler(req, res) {
  try {
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

    // Store wallet data for all existing tracked users
    const usersToFix = [
      {
        username: "abIenessy",
        wallet: "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQBhC4"
      },
      {
        username: "booleansolana", 
        wallet: "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQBhC4"
      },
      {
        username: "samir_chebbo",
        wallet: "Ba7S9Se73oeFR5ePhu9f1MoTP7b8xBdxTpz1eWBFBv2s"
      }
    ];

    const results = [];

    for (const user of usersToFix) {
      const userData = {
        walletAddress: user.wallet,
        twitterUsername: user.username,
        addedAt: new Date().toISOString()
      };

      await fetch(`${REDIS_URL}/set/user_data_${user.username}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(userData))
      });

      results.push({
        username: user.username,
        wallet: user.wallet,
        fixed: true
      });
    }

    return res.status(200).json({
      success: true,
      message: "Fixed all existing users with stored wallets",
      results: results
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
