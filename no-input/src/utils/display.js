const chalk = require('chalk');
const config = require('../config/envConfig');

/**
 * Displays an intro message when the application starts
 */
async function displayIntro() {
  const color = config.uiColor || 'cyan';
  
  console.log(chalk[color](`
  ┌───────────────────────────────────────────────┐
  │                                               │
  │   Solana Trading Bot                          │
  │   Running in ${config.nodeEnv} mode on ${config.network}   │
  │                                               │
  │   Trading Enabled: ${config.tradingEnabled ? 'Yes' : 'No'}                    │
  │   Strategy: ${config.strategyType}                      │
  │                                               │
  └───────────────────────────────────────────────┘
  `));
  
  // Simulate a small delay to make the intro more readable
  await new Promise(resolve => setTimeout(resolve, 1000));
}

module.exports = {
  displayIntro
}; 