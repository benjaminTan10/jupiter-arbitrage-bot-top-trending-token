const fs = require('fs');
require('dotenv').config();

/**
 * Loads configuration from environment variables
 * Falls back to config.json if specified variables aren't found
 */
const loadConfigFromEnv = () => {
  // Network and RPC configuration
  const network = process.env.NETWORK || 'mainnet-beta';
  const defaultRpc = process.env.DEFAULT_RPC;
  const altRpcList = process.env.ALT_RPC_LIST ? process.env.ALT_RPC_LIST.split(',') : [];
  const rpcList = [defaultRpc, ...altRpcList].filter(Boolean);

  // Trading strategy configuration
  const tradingStrategy = process.env.STRATEGY_TYPE || 'arbitrage';
  
  // Token configuration is handled separately as it requires specific addresses
  
  // Slippage and profit settings
  const slippage = parseInt(process.env.MAX_SLIPPAGE_PERCENT * 100) || 100; // Convert percent to BPS
  const adaptiveSlippage = process.env.ADAPTIVE_SLIPPAGE === 'true' ? 1 : 0;
  const priority = parseInt(process.env.PRIORITY) || 100;
  const minPercProfit = parseFloat(process.env.MIN_PROFIT_THRESHOLD) || 0.5;
  
  // Timing settings
  const minInterval = parseInt(process.env.MIN_INTERVAL_MS) || 100;
  const maxRetryAttempts = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
  const retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 5000;
  
  // Trade size settings
  const tradeSizeValue = parseFloat(process.env.TRADE_SIZE_SOL) || 1.0;
  const tradeSizeStrategy = process.env.TRADE_SIZE_STRATEGY || 'fixed';
  
  // UI settings
  const uiColor = process.env.UI_COLOR || 'cyan';
  
  // Fall back to config.json if it exists and we need token info
  let tokenConfig = {};
  if (fs.existsSync('./config.json')) {
    const configFile = JSON.parse(fs.readFileSync('./config.json'));
    tokenConfig = {
      tokenA: configFile.tokenA || {},
      tokenB: configFile.tokenB || {},
    };
  }
  
  return {
    network,
    rpc: rpcList,
    tradingStrategy,
    ...tokenConfig,
    slippage,
    adaptiveSlippage,
    priority,
    minPercProfit,
    minInterval,
    maxRetryAttempts,
    retryDelay,
    tradeSize: {
      value: tradeSizeValue,
      strategy: tradeSizeStrategy,
    },
    ui: {
      defaultColor: uiColor,
    },
    storeFailedTxInHistory: true,
    tradingEnabled: process.env.TRADING_ENABLED === 'true',
    wrapUnwrapSOL: process.env.WRAP_UNWRAP_SOL === 'true',
    autoRetryFailed: process.env.AUTO_RETRY_FAILED === 'true',
  };
};

module.exports = { loadConfigFromEnv }; 