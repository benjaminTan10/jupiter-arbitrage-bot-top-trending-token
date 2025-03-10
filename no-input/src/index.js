const config = require('./config/envConfig');
const { displayIntro } = require('./utils/display');
const Trader = require('./trading/trader');

async function main() {
  // Validate configuration
  if (!config.validate()) {
    console.error('Invalid configuration. Please check your .env file.');
    process.exit(1);
  }

  // Display intro unless skipped
  if (!config.skipIntro) {
    await displayIntro();
  }

  console.log('Configuration loaded from environment variables:');
  console.log('RPC URL:', config.rpcUrl);
  console.log('Trading Enabled:', config.tradingEnabled);
  console.log('Strategy Type:', config.strategyType);
  
  // Initialize the trader
  const trader = new Trader(config);
  
  // Set up event handlers
  trader.on('tradingSuccess', (opportunity) => {
    console.log(`Trading success event: Profit $${opportunity.estimatedValue.toFixed(2)}`);
  });
  
  trader.on('tradingError', (error) => {
    console.error('Trading error event:', error.message);
  });
  
  // Initialize and start trading
  try {
    await trader.initialize();
    await trader.startTrading();
    
    console.log('Bot is now running. Press CTRL+C to stop.');
  } catch (error) {
    console.error('Failed to start trading:', error);
    process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    trader.stopTrading();
    console.log('Goodbye!');
    process.exit(0);
  });
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 