const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { createTempDir } = require('../utils');

/**
 * Finds arbitrage opportunities between DEXes for a given token
 * @param {Object} tokenPrices - Map of DEX names to price information
 * @param {Number} minProfitPercent - Minimum profit percentage to consider (e.g., 1.0 = 1%)
 * @returns {Array} Array of arbitrage opportunities
 */
const findArbitrageForToken = (tokenSymbol, tokenPrices, minProfitPercent = 1.0) => {
  const dexes = Object.keys(tokenPrices);
  const opportunities = [];
  
  // Need at least 2 DEXes to find arbitrage
  if (dexes.length < 2) {
    return opportunities;
  }
  
  // Find the DEX with lowest price (to buy from)
  let lowestPriceDex = dexes[0];
  let lowestPrice = tokenPrices[lowestPriceDex].price;
  
  // Find the DEX with highest price (to sell to)
  let highestPriceDex = dexes[0];
  let highestPrice = tokenPrices[highestPriceDex].price;
  
  dexes.forEach(dex => {
    const price = tokenPrices[dex].price;
    if (price < lowestPrice) {
      lowestPrice = price;
      lowestPriceDex = dex;
    }
    if (price > highestPrice) {
      highestPrice = price;
      highestPriceDex = dex;
    }
  });
  
  // Calculate potential profit percentage
  const profitPercent = ((highestPrice / lowestPrice) - 1) * 100;
  
  // Check if profit exceeds minimum threshold
  if (profitPercent >= minProfitPercent && lowestPriceDex !== highestPriceDex) {
    opportunities.push({
      tokenSymbol,
      buyDex: lowestPriceDex,
      buyPrice: lowestPrice,
      sellDex: highestPriceDex,
      sellPrice: highestPrice,
      profitPercent,
      timestamp: new Date().toISOString()
    });
  }
  
  return opportunities;
};

/**
 * Analyzes all tokens for arbitrage opportunities
 * @param {Object} allPrices - Map of token addresses to their prices by DEX
 * @param {Number} minProfitPercent - Minimum profit percentage to consider
 * @returns {Array} Array of all arbitrage opportunities
 */
const findAllArbitrageOpportunities = (allPrices, minProfitPercent = 1.0) => {
  console.log(chalk.cyan(`Analyzing ${Object.keys(allPrices).length} tokens for arbitrage opportunities...`));
  const allOpportunities = [];
  
  Object.keys(allPrices).forEach(tokenAddress => {
    const token = allPrices[tokenAddress];
    const opportunities = findArbitrageForToken(
      token.symbol,
      token.prices,
      minProfitPercent
    );
    
    if (opportunities.length > 0) {
      allOpportunities.push(...opportunities);
    }
  });
  
  // Sort by profit percentage (descending)
  allOpportunities.sort((a, b) => b.profitPercent - a.profitPercent);
  
  // Store the results
  createTempDir();
  fs.writeFileSync(
    path.join(process.cwd(), 'temp', 'arbitrage-opportunities.json'),
    JSON.stringify(allOpportunities, null, 2)
  );
  
  console.log(chalk.green(`Found ${allOpportunities.length} arbitrage opportunities with at least ${minProfitPercent}% profit`));
  
  // Log top opportunities
  if (allOpportunities.length > 0) {
    console.log(chalk.yellow('\n===== TOP ARBITRAGE OPPORTUNITIES ====='));
    allOpportunities.slice(0, 10).forEach((opp, index) => {
      console.log(chalk.white(`\n${index + 1}. ${chalk.bold(opp.tokenSymbol)}`));
      console.log(chalk.green(`   Buy from: ${opp.buyDex} at ${opp.buyPrice}`));
      console.log(chalk.red(`   Sell to: ${opp.sellDex} at ${opp.sellPrice}`));
      console.log(chalk.yellow(`   Profit: ${opp.profitPercent.toFixed(2)}%`));
    });
    console.log(chalk.yellow('\n=======================================\n'));
  }
  
  return allOpportunities;
};

module.exports = { findAllArbitrageOpportunities, findArbitrageForToken }; 