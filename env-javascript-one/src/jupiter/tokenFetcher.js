const axios = require('axios');

/**
 * Fetches the top trending tokens from Jupiter API
 * @param {number} limit - Maximum number of tokens to fetch (default: 100)
 * @returns {Promise<Array>} - Array of token objects
 */
async function fetchTrendingTokens(limit = 100) {
  try {
    const response = await axios.get('https://tokens.jup.ag/tokens?tags=birdeye-trending');
    
    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Invalid response format from Jupiter API');
    }
    
    // Sort and limit the tokens as needed
    return response.data.slice(0, limit);
  } catch (error) {
    console.error('Error fetching trending tokens:', error);
    throw error;
  }
}

/**
 * Get token details by address
 * @param {string} address - Token address
 * @param {Array} tokens - Array of token objects
 * @returns {Object|null} - Token details or null if not found
 */
function getTokenByAddress(address, tokens) {
  return tokens.find(token => token.address === address) || null;
}

/**
 * Get token details by symbol
 * @param {string} symbol - Token symbol
 * @param {Array} tokens - Array of token objects
 * @returns {Object|null} - Token details or null if not found
 */
function getTokenBySymbol(symbol, tokens) {
  return tokens.find(token => token.symbol === symbol) || null;
}

module.exports = {
  fetchTrendingTokens,
  getTokenByAddress,
  getTokenBySymbol
}; 