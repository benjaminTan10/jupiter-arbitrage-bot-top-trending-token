const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

/**
 * Enhanced logging for arbitrage opportunities with detailed price information
 * @param {Array} opportunities - List of arbitrage opportunities 
 * @param {Object} allPrices - All token prices across DEXes
 */
const logEnhancedArbitrageOpportunities = (opportunities, allPrices = {}, limit = 10) => {
  if (!opportunities || opportunities.length === 0) {
    console.log(chalk.yellow('No arbitrage opportunities found in this scan.'));
    return;
  }

  console.log(chalk.green.bold(`\n===== FOUND ${opportunities.length} ARBITRAGE OPPORTUNITIES =====`));
  
  // Display top opportunities with more details
  const topOpps = opportunities.slice(0, limit);
  
  topOpps.forEach((opp, index) => {
    console.log(chalk.cyan.bold(`\n#${index + 1}: ${opp.tokenSymbol} (${opp.tokenAddress.slice(0, 8)}...)`));
    console.log(chalk.white(`  Buy from: ${chalk.green(opp.buyDex)} at price ${chalk.green(opp.buyPrice.toFixed(8))}`));
    console.log(chalk.white(`  Sell to: ${chalk.red(opp.sellDex)} at price ${chalk.red(opp.sellPrice.toFixed(8))}`));
    console.log(chalk.white(`  Profit: ${chalk.yellow(opp.profitPercent.toFixed(2))}% (potential ${chalk.yellow((opp.profitPercent / 100 * opp.tradeSize).toFixed(4))} SOL)`));
    
    // If we have all prices data, display prices on other DEXes as well
    if (allPrices[opp.tokenAddress]) {
      const tokenPrices = allPrices[opp.tokenAddress].prices;
      const dexes = Object.keys(tokenPrices);
      
      if (dexes.length > 2) {
        console.log(chalk.gray(`  Prices on other DEXes:`));
        dexes.forEach(dex => {
          // Skip the buy and sell DEXes as they're already shown above
          if (dex !== opp.buyDex && dex !== opp.sellDex) {
            const price = tokenPrices[dex].price;
            console.log(chalk.gray(`    - ${dex}: ${price.toFixed(8)}`));
          }
        });
      }
    }
    
    // Add timestamp
    console.log(chalk.gray(`  Timestamp: ${moment(opp.timestamp).format('HH:mm:ss')}`));
    
    // Add trade path information if available
    if (opp.buyPath && opp.sellPath) {
      console.log(chalk.gray(`  Buy path: ${opp.buyPath.join(' → ')}`));
      console.log(chalk.gray(`  Sell path: ${opp.sellPath.join(' → ')}`));
    }
  });
  
  console.log(chalk.green.bold('\n=================================================\n'));
  
  // Save more detailed log to file
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const logFilePath = path.join(tempDir, 'detailed-arbitrage-log.txt');
    
    let logContent = `DETAILED ARBITRAGE SCAN - ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`;
    logContent += `Total opportunities found: ${opportunities.length}\n\n`;
    
    opportunities.forEach((opp, index) => {
      logContent += `Opportunity #${index + 1}: ${opp.tokenSymbol}\n`;
      logContent += `  Token address: ${opp.tokenAddress}\n`;
      logContent += `  Buy from: ${opp.buyDex} at price ${opp.buyPrice.toFixed(8)}\n`;
      logContent += `  Sell to: ${opp.sellDex} at price ${opp.sellPrice.toFixed(8)}\n`;
      logContent += `  Profit: ${opp.profitPercent.toFixed(2)}%\n`;
      
      // Add all DEX prices if available
      if (allPrices[opp.tokenAddress]) {
        const tokenPrices = allPrices[opp.tokenAddress].prices;
        logContent += `  All DEX prices:\n`;
        Object.keys(tokenPrices).forEach(dex => {
          const price = tokenPrices[dex].price;
          logContent += `    - ${dex}: ${price.toFixed(8)}\n`;
        });
      }
      
      // Add other metadata
      logContent += `  Timestamp: ${moment(opp.timestamp).format('YYYY-MM-DD HH:mm:ss')}\n`;
      logContent += `  Estimated gas cost: ${opp.estimatedGasCost || 'Unknown'}\n`;
      logContent += `  Net profit after gas: ${opp.netProfit || opp.profitPercent.toFixed(2)}%\n\n`;
    });
    
    fs.appendFileSync(logFilePath, logContent);
    console.log(chalk.gray(`Detailed arbitrage log saved to ${logFilePath}`));
    
  } catch (error) {
    console.error('Error writing detailed arbitrage log:', error);
  }
};

/**
 * Log current token market data across DEXes for monitoring
 * @param {Object} tokenData - Token with prices across DEXes
 */
const logTokenMarketData = (tokenData) => {
  if (!tokenData) return;
  
  const { symbol, name, address, prices } = tokenData;
  const dexes = Object.keys(prices);
  
  console.log(chalk.cyan.bold(`\n----- MARKET DATA FOR ${symbol} -----`));
  console.log(chalk.white(`  Token: ${name} (${address.slice(0, 8)}...)`));
  
  // Format price data as a table
  console.log(chalk.white(`  Prices:`));
  
  // Find min and max prices
  let minPrice = Infinity;
  let maxPrice = 0;
  let minDex = '';
  let maxDex = '';
  
  dexes.forEach(dex => {
    const price = prices[dex].price;
    if (price < minPrice) {
      minPrice = price;
      minDex = dex;
    }
    if (price > maxPrice) {
      maxPrice = price;
      maxDex = dex;
    }
  });
  
  // Calculate price variance
  const priceVariance = ((maxPrice / minPrice) - 1) * 100;
  
  // Display prices in descending order
  const sortedDexes = dexes.sort((a, b) => prices[b].price - prices[a].price);
  
  sortedDexes.forEach(dex => {
    const price = prices[dex].price;
    
    // Highlight min and max prices
    if (dex === maxDex) {
      console.log(chalk.red(`    ${dex.padEnd(15)}: ${price.toFixed(8)} (HIGHEST)`));
    } else if (dex === minDex) {
      console.log(chalk.green(`    ${dex.padEnd(15)}: ${price.toFixed(8)} (LOWEST)`));
    } else {
      console.log(chalk.gray(`    ${dex.padEnd(15)}: ${price.toFixed(8)}`));
    }
  });
  
  console.log(chalk.yellow(`  Price variance: ${priceVariance.toFixed(2)}%`));
  if (priceVariance > 1.0) {
    console.log(chalk.green.bold(`  Potential arbitrage opportunity: ${minDex} → ${maxDex}`));
  }
  
  console.log(chalk.cyan.bold(`------------------------------\n`));
};

module.exports = { 
  logEnhancedArbitrageOpportunities,
  logTokenMarketData
}; 