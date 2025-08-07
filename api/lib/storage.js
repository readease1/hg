// /api/lib/storage.js - Simple file-based storage for tracking data
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = '/tmp';
const TRACKING_FILE = path.join(DATA_DIR, 'wallet-tracking.json');
const LAST_CHECKED_FILE = path.join(DATA_DIR, 'last-checked.json');

class Storage {
  constructor() {
    this.trackingData = null;
    this.lastCheckedData = null;
  }

  async ensureDataFiles() {
    try {
      // Ensure tracking file exists
      try {
        await fs.access(TRACKING_FILE);
      } catch {
        await fs.writeFile(TRACKING_FILE, JSON.stringify({ users: {}, wallets: {} }));
      }

      // Ensure last checked file exists
      try {
        await fs.access(LAST_CHECKED_FILE);
      } catch {
        await fs.writeFile(LAST_CHECKED_FILE, JSON.stringify({ lastBlock: 0, wallets: {} }));
      }
    } catch (error) {
      console.error('Error ensuring data files:', error);
    }
  }

  async loadTrackingData() {
    if (this.trackingData) return this.trackingData;
    
    await this.ensureDataFiles();
    
    try {
      const data = await fs.readFile(TRACKING_FILE, 'utf8');
      this.trackingData = JSON.parse(data);
      
      // Ensure proper structure
      if (!this.trackingData.users) this.trackingData.users = {};
      if (!this.trackingData.wallets) this.trackingData.wallets = {};
      
      return this.trackingData;
    } catch (error) {
      console.error('Error loading tracking data:', error);
      this.trackingData = { users: {}, wallets: {} };
      return this.trackingData;
    }
  }

  async saveTrackingData() {
    if (!this.trackingData) return;
    
    try {
      await fs.writeFile(TRACKING_FILE, JSON.stringify(this.trackingData, null, 2));
    } catch (error) {
      console.error('Error saving tracking data:', error);
    }
  }

  async loadLastCheckedData() {
    if (this.lastCheckedData) return this.lastCheckedData;
    
    await this.ensureDataFiles();
    
    try {
      const data = await fs.readFile(LAST_CHECKED_FILE, 'utf8');
      this.lastCheckedData = JSON.parse(data);
      
      if (!this.lastCheckedData.wallets) this.lastCheckedData.wallets = {};
      
      return this.lastCheckedData;
    } catch (error) {
      console.error('Error loading last checked data:', error);
      this.lastCheckedData = { lastBlock: 0, wallets: {} };
      return this.lastCheckedData;
    }
  }

  async saveLastCheckedData() {
    if (!this.lastCheckedData) return;
    
    try {
      await fs.writeFile(LAST_CHECKED_FILE, JSON.stringify(this.lastCheckedData, null, 2));
    } catch (error) {
      console.error('Error saving last checked data:', error);
    }
  }

  // Add a wallet to a user's tracking list
  async addTrackedWallet(userId, username, chatId, walletAddress) {
    const data = await this.loadTrackingData();
    
    // Initialize user data if not exists
    if (!data.users[userId]) {
      data.users[userId] = {
        username: username,
        chatId: chatId,
        wallets: [],
        createdAt: new Date().toISOString()
      };
    } else {
      // Update chat ID and username in case they changed
      data.users[userId].chatId = chatId;
      data.users[userId].username = username;
    }

    // Check if wallet is already tracked by this user
    if (data.users[userId].wallets.includes(walletAddress)) {
      return false; // Already tracking
    }

    // Add wallet to user's list
    data.users[userId].wallets.push(walletAddress);

    // Add to global wallet tracking (for efficient monitoring)
    if (!data.wallets[walletAddress]) {
      data.wallets[walletAddress] = {
        trackers: [],
        addedAt: new Date().toISOString()
      };
    }

    // Add user to wallet's tracker list if not already there
    if (!data.wallets[walletAddress].trackers.some(t => t.userId === userId)) {
      data.wallets[walletAddress].trackers.push({
        userId: userId,
        username: username,
        chatId: chatId,
        addedAt: new Date().toISOString()
      });
    }

    await this.saveTrackingData();
    return true;
  }

  // Remove a wallet from a user's tracking list
  async removeTrackedWallet(userId, walletAddress) {
    const data = await this.loadTrackingData();

    if (!data.users[userId]) {
      return false; // User doesn't exist
    }

    const walletIndex = data.users[userId].wallets.indexOf(walletAddress);
    if (walletIndex === -1) {
      return false; // Wallet not in user's list
    }

    // Remove wallet from user's list
    data.users[userId].wallets.splice(walletIndex, 1);

    // Remove user from wallet's tracker list
    if (data.wallets[walletAddress]) {
      data.wallets[walletAddress].trackers = data.wallets[walletAddress].trackers.filter(
        t => t.userId !== userId
      );

      // If no one is tracking this wallet anymore, remove it
      if (data.wallets[walletAddress].trackers.length === 0) {
        delete data.wallets[walletAddress];
      }
    }

    await this.saveTrackingData();
    return true;
  }

  // Get all wallets tracked by a user
  async getUserWallets(userId) {
    const data = await this.loadTrackingData();
    
    if (!data.users[userId]) {
      return [];
    }

    return data.users[userId].wallets || [];
  }

  // Get all tracked wallets (for monitoring)
  async getAllTrackedWallets() {
    const data = await this.loadTrackingData();
    return Object.keys(data.wallets || {});
  }

  // Get all trackers for a specific wallet
  async getWalletTrackers(walletAddress) {
    const data = await this.loadTrackingData();
    
    if (!data.wallets[walletAddress]) {
      return [];
    }

    return data.wallets[walletAddress].trackers || [];
  }

  // Update last checked timestamp for a wallet
  async updateLastChecked(walletAddress, timestamp) {
    const data = await this.loadLastCheckedData();
    data.wallets[walletAddress] = timestamp;
    await this.saveLastCheckedData();
  }

  // Get last checked timestamp for a wallet
  async getLastChecked(walletAddress) {
    const data = await this.loadLastCheckedData();
    return data.wallets[walletAddress] || 0;
  }

  // Get tracking statistics
  async getStats() {
    const data = await this.loadTrackingData();
    
    const totalUsers = Object.keys(data.users || {}).length;
    const totalWallets = Object.keys(data.wallets || {}).length;
    
    let totalTracking = 0;
    Object.values(data.users || {}).forEach(user => {
      totalTracking += (user.wallets || []).length;
    });

    return {
      totalUsers,
      totalWallets,
      totalTracking
    };
  }
}

// Export singleton instance
export const storage = new Storage();