require('dotenv').config();
const {PublicKey} = require('../utils/solana-web3');

/**
 * Configuration loader that reads from environment variables
 * instead of requiring CLI input
 */
class EnvConfig {
  constructor() {
    // Core Configuration
    this.privateKey = process.env.PRIVATE_KEY || process.env.SOLANA_WALLET_PRIVATE_KEY;
    this.rpcUrl = process.env.DEFAULT_RPC || process.env.RPC_URL;
    this.altRpcList = process.env.ALT_RPC_LIST ? process.env.ALT_RPC_LIST.split(',') : [];

    // Jupiter Configuration
    this.grpcUrl = process.env.GRPC_URL;
    this.xToken = process.env.X_TOKEN;

    // Token Configuration
    this.poolAddress = process.env.POOL_ADDRESS;
    this.mintAddress = process.env.MINT_ADDRESS;
    this.targetAddress = process.env.TARGET_ADDRESS;
    this.targetPrice = parseFloat(process.env.TARGET_PRICE || '0');
    this.minPriceDifference = parseFloat(process.env.MIN_PRICE_DIFFERENCE || '0');

    // Transaction Settings
    this.unitPrice = parseInt(process.env.UNIT_PRICE || '20000',10);
    this.unitLimit = parseInt(process.env.UNIT_LIMIT || '200000',10);
    this.txSimulate = process.env.TX_SIMULATE === 'true';
    this.slippage = parseFloat(process.env.SLIPPAGE || '0.01');

    // Trading Configuration
    this.tradingEnabled = process.env.TRADING_ENABLED === 'true';
    this.wrapUnwrapSol = process.env.WRAP_UNWRAP_SOL === 'true';
    this.tradeSizeSol = parseFloat(process.env.TRADE_SIZE_SOL || '1.0');
    this.tradeSizeStrategy = process.env.TRADE_SIZE_STRATEGY || 'fixed';
    this.maxSlippagePercent = parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '1.0');
    this.autoRetryFailed = process.env.AUTO_RETRY_FAILED === 'true';
    this.retryDelayMs = parseInt(process.env.RETRY_DELAY_MS || '5000',10);
    this.maxRetryAttempts = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3',10);
    this.minIntervalMs = parseInt(process.env.MIN_INTERVAL_MS || '100',10);
    this.adaptiveSlippage = process.env.ADAPTIVE_SLIPPAGE === 'true';
    this.priority = parseInt(process.env.PRIORITY || '100',10);

    // Update interval - interpret as milliseconds directly
    this.updateInterval = parseInt(process.env.UPDATE_INTERVAL || '300',10);

    this.positionLimit = parseInt(process.env.POSITION_LIMIT || '10',10);
    this.autoHedge = process.env.AUTO_HEDGE === 'true';

    // Arbitrage Scanner
    this.enableArbScanner = process.env.ENABLE_ARB_SCANNER === 'true';
    this.arbScanIntervalMinutes = parseInt(process.env.ARB_SCAN_INTERVAL_MINUTES || '60',10);
    this.arbTokenLimit = parseInt(process.env.ARB_TOKEN_LIMIT || '50',10);

    // Trending Token Settings
    this.fetchTrendingTokens = process.env.FETCH_TRENDING_TOKENS === 'true';
    this.trendingTokenUpdateInterval = parseInt(process.env.TRENDING_TOKEN_UPDATE_INTERVAL || '300',10);
    this.trendingTokenSources = process.env.TRENDING_TOKEN_SOURCES ?
      process.env.TRENDING_TOKEN_SOURCES.split(',') :
      ['raydium','orca','meteora'];
    this.trendingTokenLimit = parseInt(process.env.TRENDING_TOKEN_LIMIT || '10',10);
    this.trendingMinVolume = parseFloat(process.env.TRENDING_MIN_VOLUME || '50000',10);
    this.tradeTrendingTokens = process.env.TRADE_TRENDING_TOKENS === 'true';

    // Trading Strategy
    this.strategyType = process.env.STRATEGY_TYPE || 'arbitrage';
    this.minProfitThreshold = parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.5');

    // Debug Settings
    this.debug = process.env.DEBUG === 'true';
    this.skipIntro = process.env.SKIP_INTRO === 'true';

    // UI Settings
    this.uiColor = process.env.UI_COLOR || 'cyan';
    this.logLevel = process.env.LOG_LEVEL || 'info';

    // Environment Settings
    this.nodeEnv = process.env.NODE_ENV || 'production';
    this.network = process.env.NETWORK || 'mainnet-beta';

    // Notification Settings
    this.enableNotifications = process.env.ENABLE_NOTIFICATIONS === 'true';
    this.notificationEndpoint = process.env.NOTIFICATION_ENDPOINT || '';
    this.notificationApiKey = process.env.NOTIFICATION_API_KEY || '';
  }

  /**
   * Validate that a string is a valid Solana public key
   * @param {string} address - The address to validate
   * @returns {boolean} True if valid
   */
  isValidPublicKey(address) {
    try {
      if(!address) return false;
      new PublicKey(address);
      return true;
    } catch(error) {
      return false;
    }
  }

  /**
   * Validates that all required configuration is present
   * @returns {boolean} True if configuration is valid
   */
  validate() {
    const requiredFields = [
      'privateKey',
      'rpcUrl'
    ];

    for(const field of requiredFields) {
      if(!this[field]) {
        console.error(`Missing required configuration: ${field}`);
        return false;
      }
    }

    // Validate mint address if provided
    if(this.mintAddress && !this.isValidPublicKey(this.mintAddress)) {
      console.error(`Invalid mint address format: ${this.mintAddress}`);
      return false;
    }

    return true;
  }

  /**
   * Returns the configuration as a simple object
   * @returns {Object} Configuration object
   */
  toObject() {
    return {...this};
  }
}

// Create and export a singleton instance
const config = new EnvConfig();
module.exports = config; 