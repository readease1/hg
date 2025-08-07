export default async function handler(req, res) {
  // Check auth
  const AUTH_TOKEN = process.env.MONITOR_AUTH_TOKEN;
  if (req.headers.authorization !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Just test basic functionality
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      auth: "OK",
      message: "Monitor endpoint is working"
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}
