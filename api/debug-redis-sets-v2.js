// Debug Redis sets for usernames
import { storage } from './lib/storage.js';

export default async function handler(req, res) {
  try {
    // Check what's in the tracked_usernames set
    const trackedUsernamesRaw = await storage.smembers('tracked_usernames');
    
    // Try adding manually with direct Redis call
    const REDIS_URL = process.env.KV_REST_API_URL;
    const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;
    
    // Clear and re-add properly
    await fetch(`${REDIS_URL}/del/tracked_usernames`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Add username correctly
    const addResponse = await fetch(`${REDIS_URL}/sadd/tracked_usernames`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(["abIenessy"])
    });
    
    const addResult = await addResponse.json();
    
    // Check result
    const trackedUsernamesAfter = await storage.smembers('tracked_usernames');
    
    return res.status(200).json({
      before: trackedUsernamesRaw,
      addResult: addResult.result,
      after: trackedUsernamesAfter,
      fixed: trackedUsernamesAfter.includes('abIenessy')
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
