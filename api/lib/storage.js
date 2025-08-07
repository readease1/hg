// /api/lib/storage.js - Redis-based storage for tracking data
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
      // For Redis REST API, we need to send the data directly, not JSON.stringify it again
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
    // For Redis sets, we need to send the member as a string, not JSON
    const url = `${this.baseUrl}/sadd/${encodeURIComponent(key)}`;
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([member]) // Redis SADD expects an array of members
    };

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Redis SADD failed: ${response.status}`);
      }
      
      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error('Redis SADD error:', error);
      return null;
    }
  }

  async srem(key, member) {
    // For Redis sets, we need to send the member as a string, not JSON
    const url = `${this.baseUrl}/srem/${encodeURIComponent(key)}`;
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([member]) // Redis SREM expects an array of members
    };

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Redis SREM failed: ${response.status}`);
      }
      
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

  // Add a wallet to a user's tracking list
  async addTrackedWallet(userId, username, chatId, walletAddress) {
    try {
      // Get user data
      const userKey = `user:${userId}`;
      let userData = await this.get(userKey);
      
      if (!userData) {
        userData = {
          username: username,
          chatId: chatId,
          wallets: [],
          createdAt: new Date().toISOString()
        };
      } else {
        // Update chat ID and username in case they changed
        userData.chatId = chatId;
        userData.username = username;
      }

      // Check if wallet is already tracked by this user
      if (userData.wallets.includes(walletAddress)) {
        return false; // Already tracking
      }

      // Add wallet to user's list
      userData.wallets.push(walletAddress);
      await this.set(userKey, userData);

      // Add to wallet's tracker list
      const walletKey = `wallet:${walletAddress}`;
      let walletData = await this.get(walletKey);
      
      if (!walletData) {
        walletData = {
          trackers: [],
          addedAt: new Date().toISOString()
        };
      }

      // Add user to wallet's tracker list if not already there
      const existingTracker = walletData.trackers.find(t => t.userId === userId);
      if (!existingTracker) {
        walletData.trackers.push({
          userId: userId,
          username: username,
          chatId: chatId,
          addedAt: new Date().toISOString()
        });
      }

      await this.set(walletKey, walletData);

      // Add to global tracked wallets set
      await this.sadd('tracked_wallets', walletAddress);

      console.log(`✅ Added wallet ${walletAddress} for user ${username}`);
      return true;

    } catch (error) {
      console.error('Error adding tracked wallet:', error);
      return false;
    }
  }

  // Remove a wallet from a user's tracking list
  async removeTrackedWallet(userId, walletAddress) {
    try {
      // Get user data
      const userKey = `user:${userId}`;
      const userData = await this.get(userKey);
      
      if (!userData || !userData.wallets) {
        return false; // User doesn't exist or has no wallets
      }

      const walletIndex = userData.wallets.indexOf(walletAddress);
      if (walletIndex === -1) {
        return false; // Wallet not in user's list
      }

      // Remove wallet from user's list
      userData.wallets.splice(walletIndex, 1);
      await this.set(userKey, userData);

      // Update wallet's tracker list
      const walletKey = `wallet:${walletAddress}`;
      const walletData = await this.get(walletKey);
      
      if (walletData && walletData.trackers) {
        walletData.trackers = walletData.trackers.filter(t => t.userId !== userId);
        
        if (walletData.trackers.length === 0) {
          // No one tracking this wallet anymore
          await this.del(walletKey);
          await this.srem('tracked_wallets', walletAddress);
        } else {
          await this.set(walletKey, walletData);
        }
      }

      console.log(`✅ Removed wallet ${walletAddress} for user ${userId}`);
      return true;

    } catch (error) {
      console.error('Error removing tracked wallet:', error);
      return false;
    }
  }

  // Get all wallets tracked by a user
  async getUserWallets(userId) {
    try {
      const userKey = `user:${userId}`;
      const userData = await this.get(userKey);
      
      console.log(`Getting wallets for user ${userId}:`, userData);
      
      if (!userData || !userData.wallets) {
        return [];
      }

      return userData.wallets;
    } catch (error) {
      console.error('Error getting user wallets:', error);
      return [];
    }
  }

  // Get all tracked wallets (for monitoring)
  async getAllTrackedWallets() {
    try {
      const wallets = await this.smembers('tracked_wallets');
      return wallets || [];
    } catch (error) {
      console.error('Error getting all tracked wallets:', error);
      return [];
    }
  }

  // Get all trackers for a specific wallet
  async getWalletTrackers(walletAddress) {
    try {
      const walletKey = `wallet:${walletAddress}`;
      const walletData = await this.get(walletKey);
      
      if (!walletData || !walletData.trackers) {
        return [];
      }

      return walletData.trackers;
    } catch (error) {
      console.error('Error getting wallet trackers:', error);
      return [];
    }
  }

  // Update last checked timestamp for a wallet
  async updateLastChecked(walletAddress, timestamp) {
    try {
      const key = `last_checked:${walletAddress}`;
      await this.set(key, timestamp);
    } catch (error) {
      console.error('Error updating last checked:', error);
    }
  }

  // Get last checked timestamp for a wallet
  async getLastChecked(walletAddress) {
    try {
      const key = `last_checked:${walletAddress}`;
      const timestamp = await this.get(key);
      return timestamp || 0;
    } catch (error) {
      console.error('Error getting last checked:', error);
      return 0;
    }
  }

  // Get tracking statistics
  async getStats() {
    try {
      const trackedWallets = await this.getAllTrackedWallets();
      const totalWallets = trackedWallets.length;
      
      // Count users and total tracking relationships
      let totalUsers = 0;
      let totalTracking = 0;
      
      // This is a simplified count - in a real app you'd want to optimize this
      const userKeys = []; // We'd need to track user keys separately for efficiency
      
      return {
        totalUsers: totalUsers, // Will be 0 for now - we'd need to track this separately
        totalWallets: totalWallets,
        totalTracking: totalTracking // Will be 0 for now
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalUsers: 0,
        totalWallets: 0,
        totalTracking: 0
      };
    }
  }
}

// Export singleton instance
export const storage = new Storage();
