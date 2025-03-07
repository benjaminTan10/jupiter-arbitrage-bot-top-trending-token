const chalk = require('chalk');
const { logTokenMarketData } = require('./enhancedArbitrageLogger');

/**
 * Monitor specific tokens continuously for arbitrage opportunities
 * @param {Object} jupiter - Initialized Jupiter instance
 * @param {Array} tokenList - List of tokens to monitor
 * @param {Object} baseToken - Base token for price comparison
 * @param {Number} refreshInterval - Time between refreshes in ms
 */
const startLiveTokenMonitor = async (jupiter, tokenList, baseToken, refreshInterval = 15000) => {
  if (!tokenList || tokenList.length === 0) {
    console.log(chalk.yellow('No tokens provided for monitoring'));
    return;
  }
  
  console.log(chalk.magenta.bold(`\n===== STARTING LIVE TOKEN PRICE MONITOR =====`));
  console.log(chalk.white(`Monitoring ${tokenList.length} tokens every ${refreshInterval/1000} seconds`));
  console.log(chalk.white(`Press Ctrl+C to stop monitoring\n`));
  
  // Initial scan
  await refreshTokenPrices();
  
  // Start interval for continuous monitoring
  const intervalId = setInterval(refreshTokenPrices, refreshInterval);
  
  // Function to refresh token prices
  async function refreshTokenPrices() {
    try {
      for (const token of tokenList) {
        // Get prices across DEXes
        const priceData = await getTokenPricesAcrossDEXes(jupiter, token, baseToken);
        
        if (Object.keys(priceData).length > 0) {
          // Create full token data object
          const tokenData = {
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            prices: priceData
          };
          
          // Log current market data for this token
          logTokenMarketData(tokenData);
        }
      }
      console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}`));
    } catch (error) {
      console.error('Error refreshing token prices:', error);
    }
  }
  
  // Return function to stop monitoring
  return () => {
    clearInterval(intervalId);
    console.log(chalk.yellow('Token price monitoring stopped'));
  };
};

module.exports = { startLiveTokenMonitor }; 