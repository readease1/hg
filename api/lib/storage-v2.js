// /api/lib/storage-v2.js - Updated storage for username tracking
class Storage {
  constructor() {
    this.baseUrl = process.env.KV_REST_API_URL;
    this.token = process.env.KV_REST_API_TOKEN;
  }

  async makeRequest(method, key, data = null) {
    const url = `${this.baseUrl}/${method}/${encodeURIComponent(key)}`;
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data !== null) {
      options.body = typeof data === 'string' ? JSON.stringify(data) : JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Redis request failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Parse JSON strings back to objects
      if (typeof result.result === 'string' && (result.result.startsWith('{') || result.result.startsWith('['))) {
        try {
          return JSON.parse(result.result);
        } catch {
          return result.result;
        }
      }
      
      return result.result;
    } catch (error) {
      console.error('Redis request error:', error);
      return null;
    }
  }

  async get(key) {
    return await this.makeRequest('get', key);
  }

  async set(key, value) {
    return await this.makeRequest('set', key, value);
  }

  async del(key) {
    return await this.makeRequest('del', key);
  }

  async sadd(key, member) {
    const url = `${this.baseUrl}/sadd/${encodeURIComponent(key)}`;
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([member])
    };

    try {
      const response = await fetch(url, options);
      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error('Redis SADD error:', error);
      return null;
    }
  }

  async srem(key, member) {
    const url = `${this.baseUrl}/srem/${encodeURIComponent(key)}`;
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([member])
    };

    try {
      const response = await fetch(url, options);
      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error('Redis SREM error:', error);
      return null;
    }
  }

  async smembers(key) {
    const result = await this.makeRequest('smembers', key);
    return result || [];
  }

  // Add a username to a user's tracking list
  async addTrackedUsername(userId, username, chatId, targetUsername) {
    try {
      // Get user data
      const userKey = `user:${userId}`;
      let userData = await this.get(userKey);
      
      if (!userData) {
        userData = {
          username: username,
          chatId: chatId,
          trackedUsernames: [],
          createdAt: new Date().toISOString()
        };
      } else {
        userData.chatId = chatId;
        userData.username = username;
        if (!userData.trackedUsernames) userData.trackedUsernames = [];
      }

      // Check if username is already tracked by this user
      if (userData.trackedUsernames.includes(targetUsername)) {
        return false; // Already tracking
      }

      // Add username to user's list
      userData.trackedUsernames.push(targetUsername);
      await this.set(userKey, userData);

      // Add to username's tracker list
      const usernameKey = `username:${targetUsername}`;
      let usernameData = await this.get(usernameKey);
      
      if (!usernameData) {
        usernameData = {
          trackers: [],
          addedAt: new Date().toISOString()
        };
      }

      // Add user to username's tracker list if not already there
      const existingTracker = usernameData.trackers.find(t => t.userId === userId);
      if (!existingTracker) {
        usernameData.trackers.push({
          userId: userId,
          username: username,
          chatId: chatId,
          addedAt: new Date().toISOString()
        });
      }

      await this.set(usernameKey, usernameData);

      // Add to global tracked usernames set
      await this.sadd('tracked_usernames', targetUsername);

      console.log(`✅ Added username @${targetUsername} for user ${username}`);
      return true;

    } catch (error) {
      console.error('Error adding tracked username:', error);
      return false;
    }
  }

  // Remove a username from a user's tracking list
  async removeTrackedUsername(userId, targetUsername) {
    try {
      // Get user data
      const userKey = `user:${userId}`;
      const userData = await this.get(userKey);
      
      if (!userData || !userData.trackedUsernames) {
        return false;
      }

      const usernameIndex = userData.trackedUsernames.indexOf(targetUsername);
      if (usernameIndex === -1) {
        return false;
      }

      // Remove username from user's list
      userData.trackedUsernames.splice(usernameIndex, 1);
      await this.set(userKey, userData);

      // Update username's tracker list
      const usernameKey = `username:${targetUsername}`;
      const usernameData = await this.get(usernameKey);
      
      if (usernameData && usernameData.trackers) {
        usernameData.trackers = usernameData.trackers.filter(t => t.userId !== userId);
        
        if (usernameData.trackers.length === 0) {
          // No one tracking this username anymore
          await this.del(usernameKey);
          await this.srem('tracked_usernames', targetUsername);
        } else {
          await this.set(usernameKey, usernameData);
        }
      }

      console.log(`✅ Removed username @${targetUsername} for user ${userId}`);
      return true;

    } catch (error) {
      console.error('Error removing tracked username:', error);
      return false;
    }
  }

  // Get all usernames tracked by a user
  async getUserTrackedUsernames(userId) {
    try {
      const userKey = `user:${userId}`;
      const userData = await this.get(userKey);
      
      if (!userData || !userData.trackedUsernames) {
        return [];
      }

      return userData.trackedUsernames;
    } catch (error) {
      console.error('Error getting user tracked usernames:', error);
      return [];
    }
  }

  // Get all tracked usernames (for monitoring)
  async getAllTrackedUsernames() {
    try {
      const usernames = await this.smembers('tracked_usernames');
      // Clean up any malformed entries
      return usernames.filter(u => u && typeof u === 'string' && !u.includes('[') && !u.includes('"'));
    } catch (error) {
      console.error('Error getting all tracked usernames:', error);
      return [];
    }
  }

  // Get all trackers for a specific username
  async getUsernameTrackers(targetUsername) {
    try {
      const usernameKey = `username:${targetUsername}`;
      const usernameData = await this.get(usernameKey);
      
      if (!usernameData || !usernameData.trackers) {
        return [];
      }

      return usernameData.trackers;
    } catch (error) {
      console.error('Error getting username trackers:', error);
      return [];
    }
  }

  // Update last checked timestamp for a username
  async updateLastCheckedForUsername(targetUsername, timestamp) {
    try {
      const key = `last_checked_username:${targetUsername}`;
      await this.set(key, timestamp);
    } catch (error) {
      console.error('Error updating last checked for username:', error);
    }
  }

  // Get last checked timestamp for a username
  async getLastCheckedForUsername(targetUsername) {
    try {
      const key = `last_checked_username:${targetUsername}`;
      const timestamp = await this.get(key);
      return timestamp || 0;
    } catch (error) {
      console.error('Error getting last checked for username:', error);
      return 0;
    }
  }

  // Track which claims we've already notified about for a username
  async updateLastNotifiedClaims(targetUsername, tokenAddresses) {
    try {
      const key = `notified_claims:${targetUsername}`;
      await this.set(key, tokenAddresses);
    } catch (error) {
      console.error('Error updating notified claims:', error);
    }
  }

  // Get which claims we've already notified about for a username
  async getLastNotifiedClaims(targetUsername) {
    try {
      const key = `notified_claims:${targetUsername}`;
      const claims = await this.get(key);
      return claims || [];
    } catch (error) {
      console.error('Error getting notified claims:', error);
      return [];
    }
  }

  // Legacy methods for backward compatibility
  async getUserWallets(userId) {
    return await this.getUserTrackedUsernames(userId);
  }
}

// Export singleton instance
export const storage = new Storage();
