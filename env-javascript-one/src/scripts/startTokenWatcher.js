const TokenWatcher = require('../jupiter/tokenWatcher');

async function main() {
  try {
    const watcher = new TokenWatcher();
    
    // Set up event handlers
    process.on('SIGINT', () => {
      console.log('Stopping token watcher...');
      watcher.stop();
      process.exit(0);
    });
    
    // Start watching tokens
    await watcher.start();
    
    console.log('Token watcher is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('Failed to start token watcher:', error);
    process.exit(1);
  }
}

main(); 