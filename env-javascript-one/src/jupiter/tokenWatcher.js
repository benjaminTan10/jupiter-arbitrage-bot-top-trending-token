const fs = require('fs');
const path = require('path');
const { fetchTrendingTokens } = require('./tokenFetcher');
const JupiterGrpcClient = require('./grpcClient');

class TokenWatcher {
  constructor(cachePath = path.resolve(__dirname, '../../temp/cache.json')) {
    this.cachePath = cachePath;
    this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
    this.grpcClient = new JupiterGrpcClient();
    this.updateInterval = null;
    
    // Initialize trending tokens array if it doesn't exist
    if (!this.cache.trendingTokens) {
      this.cache.trendingTokens = [];
    }
    
    // Initialize active subscriptions object if it doesn't exist
    if (!this.cache.activeSubscriptions) {
      this.cache.activeSubscriptions = {};
    }
  }

  /**
   * Save current cache to disk
   */
  saveCache() {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
  }

  /**
   * Start watching trending tokens
   */
  async start() {
    try {
      // Connect to Jupiter gRPC service
      await this.grpcClient.connect();
      
      // Initial fetch of trending tokens
      await this.updateTrendingTokens();
      
      // Set up periodic update
      const updateInterval = this.cache.config.trendingTokenUpdateInterval || 3600000; // Default: 1 hour
      this.updateInterval = setInterval(() => {
        this.updateTrendingTokens().catch(err => {
          console.error('Error updating trending tokens:', err);
        });
      }, updateInterval);
      
      console.log('Token watcher started');
    } catch (error) {
      console.error('Failed to start token watcher:', error);
      throw error;
    }
  }

  /**
   * Stop watching trending tokens
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    // Unsubscribe from all tokens
    this.unsubscribeFromAllTokens();
    
    // Disconnect from Jupiter gRPC service
    if (this.grpcClient) {
      this.grpcClient.disconnect();
    }
    
    console.log('Token watcher stopped');
  }

  /**
   * Update the list of trending tokens
   */
  async updateTrendingTokens() {
    try {
      const maxTokens = this.cache.config.maxTrendingTokens || 100;
      const trendingTokens = await fetchTrendingTokens(maxTokens);
      
      // Update cache with new trending tokens
      this.cache.trendingTokens = trendingTokens;
      
      // Save cache to disk
      this.saveCache();
      
      console.log(`Updated trending tokens: ${trendingTokens.length} tokens`);
      
      // Update subscriptions if needed
      if (this.cache.config.useTrendingTokens) {
        await this.updateSubscriptions();
      }
      
      return trendingTokens;
    } catch (error) {
      console.error('Error updating trending tokens:', error);
      throw error;
    }
  }

  /**
   * Update gRPC subscriptions based on trending tokens
   */
  async updateSubscriptions() {
    try {
      // First, unsubscribe from all current subscriptions
      this.unsubscribeFromAllTokens();
      
      // Then, subscribe to top trending tokens
      const maxTokens = Math.min(10, this.cache.trendingTokens.length); // Limit to top 10 for performance
      
      for (let i = 0; i < maxTokens; i++) {
        const token = this.cache.trendingTokens[i];
        const subscriptionId = this.grpcClient.subscribeToToken(token.address, (data) => {
          this.handlePriceUpdate(token.address, data);
        });
        
        this.cache.activeSubscriptions[token.address] = {
          subscriptionId,
          symbol: token.symbol,
          lastUpdated: Date.now()
        };
      }
      
      // Save cache to disk
      this.saveCache();
      
      console.log(`Updated subscriptions for ${Object.keys(this.cache.activeSubscriptions).length} tokens`);
    } catch (error) {
      console.error('Error updating subscriptions:', error);
      throw error;
    }
  }

  /**
   * Handle price update from gRPC subscription
   * @param {string} tokenMint - Token mint address
   * @param {Object} data - Price update data
   */
  handlePriceUpdate(tokenMint, data) {
    // Here you would implement logic to process price updates
    // For example, you might want to:
    // 1. Update price data in the cache
    // 2. Check for arbitrage opportunities
    // 3. Trigger trades if profitable
    
    // For now, we'll just log the update and update the last updated timestamp
    if (this.cache.activeSubscriptions[tokenMint]) {
      this.cache.activeSubscriptions[tokenMint].lastUpdated = Date.now();
      this.cache.activeSubscriptions[tokenMint].lastPrice = data.price;
      
      // Save to cache periodically (not on every update to avoid disk I/O)
      if (Math.random() < 0.1) { // ~10% chance to save on each update
        this.saveCache();
      }
    }
    
    console.log(`Price update for ${tokenMint}: ${JSON.stringify(data)}`);
  }

  /**
   * Unsubscribe from all token subscriptions
   */
  unsubscribeFromAllTokens() {
    if (!this.grpcClient) return;
    
    for (const tokenMint in this.cache.activeSubscriptions) {
      const subscription = this.cache.activeSubscriptions[tokenMint];
      if (subscription.subscriptionId) {
        this.grpcClient.unsubscribe(subscription.subscriptionId);
      }
    }
    
    this.cache.activeSubscriptions = {};
    this.saveCache();
  }
}

module.exports = TokenWatcher; 