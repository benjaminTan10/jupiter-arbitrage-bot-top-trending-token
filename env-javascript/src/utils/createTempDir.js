const fs = require('fs');
const path = require('path');

/**
 * Creates the temp directory if it doesn't exist
 * Also creates tokens.json with default tokens if it doesn't exist
 */
const createTempDirectories = () => {
  const tempDir = path.join(process.cwd(), 'temp');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    console.log('Creating temp directory...');
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Create default tokens file if it doesn't exist
  const tokensPath = path.join(tempDir, 'tokens.json');
  if (!fs.existsSync(tokensPath)) {
    console.log('Creating default tokens.json file...');
    // Default tokens include SOL and popular SPL tokens
    const defaultTokens = {
      "tokens": [
        {
          "address": "So11111111111111111111111111111111111111112",
          "chainId": 101,
          "decimals": 9,
          "name": "Wrapped SOL",
          "symbol": "SOL",
          "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
          "tags": ["wrapped-solana"]
        },
        {
          "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "chainId": 101,
          "decimals": 6,
          "name": "USD Coin",
          "symbol": "USDC",
          "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
          "tags": ["stablecoin"]
        },
        {
          "address": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
          "chainId": 101,
          "decimals": 6,
          "name": "USDT",
          "symbol": "USDT",
          "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
          "tags": ["stablecoin"]
        }
      ]
    };
    fs.writeFileSync(tokensPath, JSON.stringify(defaultTokens, null, 2));
  }
  
  // Create empty cache files if they don't exist
  const cacheFiles = ['cache.json', 'tradeHistory.json'];
  cacheFiles.forEach(file => {
    const filePath = path.join(tempDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
    }
  });
};

module.exports = createTempDirectories; 