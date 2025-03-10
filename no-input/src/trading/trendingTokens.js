const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');

/**
 * Service for fetching and analyzing trending tokens
 */
class TrendingTokensService {
  constructor(config, connection) {
    this.config = config;
    this.connection = connection;
    this.trendingTokens = [];
    this.lastUpdated = null;
    this.wsolAddress = new PublicKey(config.wsolAddress);
  }

  /**
   * Initialize the trending tokens service
   */
  async initialize() {
    console.log('Initializing trending tokens service...');
    
    if (this.config.fetchTrendingTokens) {
      try {
        await this.fetchTrendingTokens();
        
        // Set up interval to periodically refresh trending tokens
        this.updateInterval = setInterval(() => {
          this.fetchTrendingTokens().catch(err => {
            console.error('Error updating trending tokens:', err);
          });
        }, this.config.trendingUpdateInterval);
        
        return true;
      } catch (error) {
        console.error('Error initializing trending tokens service:', error);
        return false;
      }
    } else {
      console.log('Trending tokens fetching is disabled');
      return false;
    }
  }

  /**
   * Fetch trending tokens from various sources
   */
  async fetchTrendingTokens() {
    console.log('Fetching trending tokens...');
    
    try {
      const tokens = [];
      
      // Fetch from Birdeye API
      if (this.config.birdeyeApiUrl) {
        try {
          const headers = {};
          if (this.config.birdeyeApiKey) {
            headers['x-api-key'] = this.config.birdeyeApiKey;
          }
          
          const response = await axios.get(`${this.config.birdeyeApiUrl}?sort_by=volume&sort_type=desc&offset=0&limit=${this.config.trendingTokenCount}`, { headers });
          
          if (response.data && response.data.data) {
            const birdeyeTokens = response.data.data.filter(token => 
              token.tags && (token.tags.includes('birdeye-trending') || token.tags.includes('verified'))
            );
            
            for (const token of birdeyeTokens) {
              tokens.push({
                source: 'birdeye',
                address: token.address,
                symbol: token.symbol,
                name: token.name,
                decimals: token.decimals,
                volume: token.daily_volume || 0,
                logoURI: token.logoURI || '',
                tags: token.tags || []
              });
            }
            
            console.log(`Found ${birdeyeTokens.length} trending tokens from Birdeye`);
          }
        } catch (error) {
          console.error('Error fetching from Birdeye:', error.message);
        }
      }
      
      // Fetch from Raydium API
      if (this.config.raydiumApiUrl) {
        try {
          const response = await axios.get(this.config.raydiumApiUrl);
          
          if (response.data && response.data.data) {
            // Filter for pairs with WSOL
            const wsolPairs = response.data.data.filter(pair => 
              pair.baseMint === this.config.wsolAddress || pair.quoteMint === this.config.wsolAddress
            )
            .sort((a, b) => b.volume7d - a.volume7d)
            .slice(0, this.config.trendingTokenCount);
            
            for (const pair of wsolPairs) {
              // Get the non-WSOL token from the pair
              const tokenMint = pair.baseMint === this.config.wsolAddress ? pair.quoteMint : pair.baseMint;
              const tokenSymbol = pair.baseMint === this.config.wsolAddress ? pair.quoteSymbol : pair.baseSymbol;
              
              tokens.push({
                source: 'raydium',
                address: tokenMint,
                symbol: tokenSymbol,
                name: tokenSymbol,
                decimals: pair.baseMint === this.config.wsolAddress ? pair.quoteDecimals : pair.baseDecimals,
                volume: pair.volume7d || 0,
                poolAddress: pair.id,
                lpMint: pair.lpMint
              });
            }
            
            console.log(`Found ${wsolPairs.length} trending tokens from Raydium`);
          }
        } catch (error) {
          console.error('Error fetching from Raydium:', error.message);
        }
      }
      
      // Fetch from Orca API
      if (this.config.orcaApiUrl) {
        try {
          const response = await axios.get(this.config.orcaApiUrl);
          
          if (response.data && response.data.pools) {
            // Filter for pairs with WSOL
            const wsolPools = Object.values(response.data.pools)
              .filter(pool => 
                pool.tokenMintA === this.config.wsolAddress || pool.tokenMintB === this.config.wsolAddress
              )
              .sort((a, b) => b.volume7d - a.volume7d)
              .slice(0, this.config.trendingTokenCount);
            
            for (const pool of wsolPools) {
              // Get the non-WSOL token from the pair
              const tokenMint = pool.tokenMintA === this.config.wsolAddress ? pool.tokenMintB : pool.tokenMintA;
              const tokenSymbol = pool.tokenMintA === this.config.wsolAddress ? pool.tokenSymbolB : pool.tokenSymbolA;
              
              tokens.push({
                source: 'orca',
                address: tokenMint,
                symbol: tokenSymbol,
                name: tokenSymbol,
                volume: pool.volume7d || 0,
                poolAddress: pool.address
              });
            }
            
            console.log(`Found ${wsolPools.length} trending tokens from Orca`);
          }
        } catch (error) {
          console.error('Error fetching from Orca:', error.message);
        }
      }
      
      // Fetch from Meteora API
      if (this.config.meteoraApiUrl) {
        try {
          const response = await axios.get(this.config.meteoraApiUrl);
          
          if (response.data) {
            // Filter for pairs with WSOL
            const wsolPools = response.data
              .filter(pool => 
                pool.tokens.some(token => token.mint === this.config.wsolAddress)
              )
              .sort((a, b) => b.volume24h - a.volume24h)
              .slice(0, this.config.trendingTokenCount);
            
            for (const pool of wsolPools) {
              // Get the non-WSOL token from the pool
              const token = pool.tokens.find(t => t.mint !== this.config.wsolAddress);
              if (token) {
                tokens.push({
                  source: 'meteora',
                  address: token.mint,
                  symbol: token.symbol,
                  name: token.name,
                  decimals: token.decimals,
                  volume: pool.volume24h || 0,
                  poolAddress: pool.address
                });
              }
            }
            
            console.log(`Found ${wsolPools.length} trending tokens from Meteora`);
          }
        } catch (error) {
          console.error('Error fetching from Meteora:', error.message);
        }
      }
      
      // Deduplicate tokens based on address
      const uniqueTokens = [];
      const addressSet = new Set();
      
      for (const token of tokens) {
        if (!addressSet.has(token.address)) {
          addressSet.add(token.address);
          uniqueTokens.push(token);
        }
      }
      
      // Sort by volume (descending)
      uniqueTokens.sort((a, b) => b.volume - a.volume);
      
      // Take the top N tokens
      this.trendingTokens = uniqueTokens.slice(0, this.config.trendingTokenCount);
      this.lastUpdated = new Date();
      
      console.log(`Successfully fetched ${this.trendingTokens.length} unique trending tokens`);
      return this.trendingTokens;
    } catch (error) {
      console.error('Error fetching trending tokens:', error);
      throw error;
    }
  }

  /**
   * Stop the trending tokens service
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Get the current trending tokens
   * @returns {Array} Array of trending tokens
   */
  getTrendingTokens() {
    return this.trendingTokens;
  }

  /**
   * Get a specific trending token by address
   * @param {string} address Token address
   * @returns {Object|null} Token information or null if not found
   */
  getTokenByAddress(address) {
    return this.trendingTokens.find(token => token.address === address) || null;
  }
}

module.exports = TrendingTokensService; 