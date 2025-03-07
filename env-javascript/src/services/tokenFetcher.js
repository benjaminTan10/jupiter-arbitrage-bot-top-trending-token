const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createTempDir } = require('../utils');

/**
 * Fetches trending tokens from Jupiter API
 * @returns {Promise<Array>} Array of trending tokens
 */
const fetchTrendingTokens = async (limit = 100) => {
  try {
    console.log(`Fetching top ${limit} trending tokens from Jupiter API...`);
    const response = await axios.get('https://tokens.jup.ag/tokens?tags=birdeye-trending');
    
    if (!response.data || !response.data.tokens) {
      throw new Error('Invalid response format from Jupiter API');
    }
    
    // Sort by volume or other relevant metric if available
    const tokens = response.data.tokens.slice(0, limit);
    
    // Store tokens in temp directory for later reference
    createTempDir();
    fs.writeFileSync(
      path.join(process.cwd(), 'temp', 'trending-tokens.json'),
      JSON.stringify(tokens, null, 2)
    );
    
    console.log(`Successfully fetched ${tokens.length} trending tokens`);
    return tokens;
  } catch (error) {
    console.error('Error fetching trending tokens:', error.message);
    // Try to read from cache if available
    try {
      const cachedPath = path.join(process.cwd(), 'temp', 'trending-tokens.json');
      if (fs.existsSync(cachedPath)) {
        console.log('Using cached trending tokens instead');
        return JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
      }
    } catch (cacheError) {
      console.error('No cached tokens available:', cacheError.message);
    }
    
    throw error;
  }
};

module.exports = { fetchTrendingTokens }; 