const config = require('./config/envConfig');
const {displayIntro} = require('./utils/display');
const Trader = require('./trading/trader-rest');
const TrendingTokensTracker = require('./trading/trendingTokens');
const {Connection} = require('@solana/web3.js');
const {initializeWallet} = require('./utils/wallet');

async function main() {
  // Validate configuration
  if(!config.validate()) {
    console.error('Invalid configuration. Please check your .env file.');
    process.exit(1);
  }

  // Display intro unless skipped
  if(!config.skipIntro) {
    await displayIntro();
  }

  // Essential config info
  console.log('Trading Enabled:',config.tradingEnabled);
  console.log('Strategy:',config.strategyType);

  try {
    // Test connection to RPC
    const connection = new Connection(config.rpcUrl,'confirmed');
    const blockHeight = await connection.getBlockHeight();
    console.log('Connected to Solana network');

    // Initialize trending tokens tracker if enabled
    let trendingTracker = null;
    if(config.fetchTrendingTokens) {
      trendingTracker = new TrendingTokensTracker(config);
      trendingTracker.start();
    }

    // Initialize the trader
    const trader = new Trader(config,trendingTracker);

    // Set up event handlers
    trader.on('tradingSuccess',(opportunity) => {
      console.log(`Trading success: Profit $${opportunity.estimatedValue.toFixed(2)}`);
    });

    trader.on('tradingError',(error) => {
      console.error('Trading error:',error.message);
    });

    // Initialize and start trading
    try {
      await trader.initialize();
      await trader.startTrading();

      console.log('Bot is now running. Press CTRL+C to stop.');
    } catch(error) {
      console.error('Failed to start trading:',error);
      process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGINT',async () => {
      console.log('Shutting down...');
      trader.stopTrading();
      if(trendingTracker) {
        trendingTracker.stop();
      }
      process.exit(0);
    });
  } catch(error) {
    console.error('Failed to connect to Solana:',error);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection',(error) => {
  console.error('Unhandled rejection:',error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Fatal error:',error);
  process.exit(1);
}); 