const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');
const config = require('../config/envConfig');

/**
 * Class to fetch and track trending tokens from various DEXs
 */
class TrendingTokensTracker extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.isRunning = false;
    this.trendingTokens = [];
    this.lastUpdate = null;
    this.updateIntervalMs = this.config.trendingTokenUpdateInterval * 1000;

    // Constants for APIs
    this.API_ENDPOINTS = {
      raydium: 'https://api.raydium.io/v2/main/trending-tokens',
      orca: 'https://api.orca.so/trending-tokens',
      meteora: 'https://api.meteora.ag/trending',
      birdeye: 'https://public-api.birdeye.so/public/tokenlist?sort_by=volume&sort_type=desc&offset=0&limit=50'
    };

    // Fallback to BirdEye API if others fail
    this.enableBirdeyeFallback = true;
  }

  /**
   * Start tracking trending tokens
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Fetch immediately on start
    this.fetchTrendingTokens();

    // Set up interval for regular updates
    this.updateInterval = setInterval(() => {
      this.fetchTrendingTokens();
    }, this.updateIntervalMs);
  }

  /**
   * Stop tracking trending tokens
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    clearInterval(this.updateInterval);
    this.isRunning = false;
  }

  /**
   * Fetch trending tokens from configured sources
   */
  async fetchTrendingTokens() {
    this.lastUpdate = new Date();
    
    try {
      const fetchPromises = [];
      const sources = this.config.trendingTokenSources;
      
      // Create fetch promises for each enabled source
      for (const source of sources) {
        if (this.API_ENDPOINTS[source]) {
          fetchPromises.push(this._fetchFromSource(source));
        }
      }
      
      // Fetch from all sources in parallel
      const results = await Promise.allSettled(fetchPromises);
      
      // Combine and process results
      let allTokens = [];
      let successfulSources = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value?.length > 0) {
          allTokens = [...allTokens, ...result.value];
          successfulSources++;
        } else {
          console.error(`Failed to fetch trending tokens from ${sources[index]}`);
        }
      });
      
      // If all sources failed, try BirdEye as fallback
      if (successfulSources === 0 && this.enableBirdeyeFallback) {
        try {
          const birdeyeTokens = await this._fetchFromSource('birdeye');
          if (birdeyeTokens?.length > 0) {
            allTokens = birdeyeTokens;
          }
        } catch (error) {
          console.error('BirdEye fallback failed');
        }
      }
      
      // Process and filter tokens
      if (allTokens.length > 0) {
        // Remove duplicates by address
        const uniqueTokens = [...new Map(allTokens.map(token => [token.address, token])).values()];
        
        // Filter by minimum volume
        const filteredTokens = uniqueTokens.filter(token => 
          token.daily_volume >= this.config.trendingMinVolume
        );
        
        // Sort by volume (descending)
        const sortedTokens = filteredTokens.sort((a, b) => b.daily_volume - a.daily_volume);
        
        // Limit number of tokens
        this.trendingTokens = sortedTokens.slice(0, this.config.trendingTokenLimit);
        
        console.log(`Found ${this.trendingTokens.length} trending tokens`);
        this.emit('tokensUpdated', this.trendingTokens);
      }
      
      return this.trendingTokens;
    } catch (error) {
      console.error('Error fetching trending tokens:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Fetch tokens from a specific source
   * @param {string} source - The source name (raydium, orca, meteora, birdeye)
   * @returns {Promise<Array>} - Array of token objects
   */
  async _fetchFromSource(source) {
    try {
      const endpoint = this.API_ENDPOINTS[source];
      const response = await axios.get(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      
      let tokens = [];
      
      // Transform response based on the source format
      switch (source) {
        case 'raydium':
          tokens = this._processRaydiumResponse(response.data);
          break;
        case 'orca':
          tokens = this._processOrcaResponse(response.data);
          break;
        case 'meteora':
          tokens = this._processMeteorResponse(response.data);
          break;
        case 'birdeye':
          tokens = this._processBirdEyeResponse(response.data);
          break;
      }
      
      return tokens;
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error.message);
      return [];
    }
  }

  /**
   * Process Raydium API response
   */
  _processRaydiumResponse(data) {
    try {
      if (!data || !Array.isArray(data.data)) {
        return [];
      }
      
      return data.data.map(token => ({
        address: token.mint || token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
        daily_volume: parseFloat(token.volume24h || 0),
        source: 'raydium',
        tags: ['raydium-trending']
      }));
    } catch (error) {
      console.error('Error processing Raydium response:', error);
      return [];
    }
  }

  /**
   * Process Orca API response
   */
  _processOrcaResponse(data) {
    try {
      if (!data || !Array.isArray(data.tokens)) {
        return [];
      }
      
      return data.tokens.map(token => ({
        address: token.address || token.mint,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
        daily_volume: parseFloat(token.volume24h || 0),
        source: 'orca',
        tags: ['orca-trending']
      }));
    } catch (error) {
      console.error('Error processing Orca response:', error);
      return [];
    }
  }

  /**
   * Process Meteor API response
   */
  _processMeteorResponse(data) {
    try {
      if (!data || !Array.isArray(data.tokens)) {
        return [];
      }
      
      return data.tokens.map(token => ({
        address: token.address || token.mint,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logo || token.logoURI,
        daily_volume: parseFloat(token.volume24h || token.volume || 0),
        source: 'meteora',
        tags: ['meteora-trending']
      }));
    } catch (error) {
      console.error('Error processing Meteora response:', error);
      return [];
    }
  }

  /**
   * Process BirdEye API response
   */
  _processBirdEyeResponse(data) {
    try {
      if (!data || !data.data || !Array.isArray(data.data.tokens)) {
        return [];
      }
      
      return data.data.tokens.map(token => ({
        address: token.address,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.logoURI,
        daily_volume: parseFloat(token.volume24h || token.volume || 0),
        source: 'birdeye',
        tags: ['birdeye-trending'],
        created_at: token.created_at
      }));
    } catch (error) {
      console.error('Error processing BirdEye response:', error);
      return [];
    }
  }

  /**
   * Get trending token by address
   * @param {string} address - Token address
   * @returns {Object|null} Token object or null if not found
   */
  getTokenByAddress(address) {
    return this.trendingTokens.find(token => token.address === address) || null;
  }

  /**
   * Get trending token by symbol
   * @param {string} symbol - Token symbol
   * @returns {Object|null} Token object or null if not found
   */
  getTokenBySymbol(symbol) {
    return this.trendingTokens.find(token => 
      token.symbol.toLowerCase() === symbol.toLowerCase()
    ) || null;
  }

  /**
   * Get the top n trending tokens
   * @param {number} limit - Number of tokens to return (default: config.trendingTokenLimit)
   * @returns {Array} Array of token objects
   */
  getTopTrendingTokens(limit = this.config.trendingTokenLimit) {
    return this.trendingTokens.slice(0, limit);
  }

  /**
   * Check if a token is in the trending list
   * @param {string} address - Token address
   * @returns {boolean} True if token is trending
   */
  isTokenTrending(address) {
    return this.trendingTokens.some(token => token.address === address);
  }

  /**
   * Get trending token/SOL pool for a specific DEX
   * @param {string} tokenAddress - Token address
   * @param {string} dex - DEX name (raydium, orca, meteora)
   * @returns {Promise<string|null>} Pool address or null if not found
   */
  async getTrendingTokenPool(tokenAddress, dex = 'raydium') {
    try {
      // WSOL address
      const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112';
      
      // Different DEXs have different API endpoints for getting pool info
      let poolAddress = null;
      
      switch (dex.toLowerCase()) {
        case 'raydium':
          // Example Raydium API call to get pool
          const raydiumResponse = await axios.get(
            `https://api.raydium.io/v2/main/pool/${tokenAddress}/${WSOL_ADDRESS}`
          );
          poolAddress = raydiumResponse.data?.id || null;
          break;
          
        case 'orca':
          // Example Orca API call
          const orcaResponse = await axios.get(
            `https://api.orca.so/pools?base=${tokenAddress}&quote=${WSOL_ADDRESS}`
          );
          poolAddress = orcaResponse.data?.data?.[0]?.address || null;
          break;
          
        case 'meteora':
          // Example Meteora call
          const meteoraResponse = await axios.get(
            `https://api.meteora.ag/pools?tokenA=${tokenAddress}&tokenB=${WSOL_ADDRESS}`
          );
          poolAddress = meteoraResponse.data?.pools?.[0]?.address || null;
          break;
          
        default:
          return null;
      }
      
      return poolAddress;
    } catch (error) {
      console.error(`Error getting pool for ${tokenAddress}:`, error.message);
      return null;
    }
  }
}

module.exports = TrendingTokensTracker; 