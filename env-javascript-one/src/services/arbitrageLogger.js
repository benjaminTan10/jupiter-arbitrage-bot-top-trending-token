const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

/**
 * Logs arbitrage opportunities in a detailed, readable format
 * @param {Array} opportunities - List of arbitrage opportunities 
 */
const logArbitrageOpportunities = (opportunities, limit = 10) => {
  if (!opportunities || opportunities.length === 0) {
    console.log(chalk.yellow('No arbitrage opportunities found in this scan.'));
    return;
  }

  console.log(chalk.green.bold(`\n===== FOUND ${opportunities.length} ARBITRAGE OPPORTUNITIES =====`));
  
  // Display top opportunities
  const topOpps = opportunities.slice(0, limit);
  
  topOpps.forEach((opp, index) => {
    console.log(chalk.cyan.bold(`\n#${index + 1}: ${opp.tokenSymbol}`));
    console.log(chalk.white(`  Buy from: ${chalk.green(opp.buyDex)} at price ${chalk.green(opp.buyPrice.toFixed(8))}`));
    console.log(chalk.white(`  Sell to: ${chalk.red(opp.sellDex)} at price ${chalk.red(opp.sellPrice.toFixed(8))}`));
    console.log(chalk.white(`  Profit: ${chalk.yellow(opp.profitPercent.toFixed(2))}%`));
    console.log(chalk.gray(`  Timestamp: ${new Date(opp.timestamp).toLocaleTimeString()}`));
  });
  
  console.log(chalk.green.bold('\n=================================================\n'));
  
  // Save to a more detailed log file
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const logFilePath = path.join(tempDir, 'arbitrage-log.txt');
    
    let logContent = `ARBITRAGE SCAN RESULTS - ${new Date().toISOString()}\n`;
    logContent += `Total opportunities found: ${opportunities.length}\n\n`;
    
    opportunities.forEach((opp, index) => {
      logContent += `Opportunity #${index + 1}: ${opp.tokenSymbol}\n`;
      logContent += `  Buy from: ${opp.buyDex} at price ${opp.buyPrice.toFixed(8)}\n`;
      logContent += `  Sell to: ${opp.sellDex} at price ${opp.sellPrice.toFixed(8)}\n`;
      logContent += `  Profit: ${opp.profitPercent.toFixed(2)}%\n`;
      logContent += `  Timestamp: ${opp.timestamp}\n\n`;
    });
    
    fs.appendFileSync(logFilePath, logContent);
    console.log(chalk.gray(`Detailed arbitrage log saved to ${logFilePath}`));
    
  } catch (error) {
    console.error('Error writing arbitrage log:', error);
  }
};

module.exports = { logArbitrageOpportunities }; 