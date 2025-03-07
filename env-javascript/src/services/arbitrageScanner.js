const { fetchTrendingTokens } = require('./tokenFetcher');
const { scanAllTokenPrices } = require('./priceScanner');
const { findAllArbitrageOpportunities } = require('./arbitrageDetector');
const chalk = require('chalk');

/**
 * Main function to scan for arbitrage opportunities across DEXes
 * @param {Object} jupiter - Initialized Jupiter instance
 * @param {Object} baseToken - Base token (usually SOL) to quote against
 * @param {Number} minProfitPercent - Minimum profit percentage to consider
 * @param {Number} tokenLimit - Maximum number of trending tokens to scan
 * @returns {Promise<Array>} Array of arbitrage opportunities
 */
const scanForArbitrageOpportunities = async (
  jupiter,
  baseToken, 
  minProfitPercent = 1.0, 
  tokenLimit = 100
) => {
  console.log(chalk.magenta.bold('\n===== STARTING ARBITRAGE SCANNER =====\n'));
  console.log(chalk.cyan(`Base token: ${baseToken.symbol} (${baseToken.address})`));
  console.log(chalk.cyan(`Minimum profit threshold: ${minProfitPercent}%`));
  console.log(chalk.cyan(`Token limit: ${tokenLimit}`));
  
  try {
    // Step 1: Fetch trending tokens
    console.log(chalk.yellow('\n[Step 1/3] Fetching trending tokens...'));
    const trendingTokens = await fetchTrendingTokens(tokenLimit);
    
    // Step 2: Get token prices across DEXes
    console.log(chalk.yellow('\n[Step 2/3] Scanning token prices across DEXes...'));
    const allPrices = await scanAllTokenPrices(jupiter, trendingTokens, baseToken);
    
    // Step 3: Find arbitrage opportunities
    console.log(chalk.yellow('\n[Step 3/3] Finding arbitrage opportunities...'));
    const opportunities = findAllArbitrageOpportunities(allPrices, minProfitPercent);
    
    console.log(chalk.magenta.bold('\n===== ARBITRAGE SCAN COMPLETE =====\n'));
    return opportunities;
  } catch (error) {
    console.error(chalk.red(`Error in arbitrage scanner: ${error.message}`));
    throw error;
  }
};

module.exports = { scanForArbitrageOpportunities }; 