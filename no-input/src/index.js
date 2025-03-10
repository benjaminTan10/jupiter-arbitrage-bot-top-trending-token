const config = require('./config/envConfig');
const { displayIntro } = require('./utils/display');

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
  
  // Here you would initialize your trading logic, connect to APIs, etc.
  // using the configuration from the environment variables
  
  // Example:
  // const trader = new Trader(config);
  // await trader.initialize();
  // await trader.startTrading();
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