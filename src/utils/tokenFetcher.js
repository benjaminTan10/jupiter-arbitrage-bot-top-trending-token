const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Creates temp directory if it doesn't exist
 */
const createTempDir = () => {
    if (!fs.existsSync("./temp")) {
        fs.mkdirSync("./temp");
    }
};

/**
 * Fetches trending tokens from Jupiter API
 * @returns {Promise<Array>} Array of trending tokens
 */
const fetchTrendingTokens = async () => {
    try {
        const response = await axios.get('https://tokens.jup.ag/tokens?tags=birdeye-trending');
        if(response.data && Array.isArray(response.data)) {
            // Save to temp directory for caching
            createTempDir();
            fs.writeFileSync(
                path.join('./temp','trending-tokens.json'),
                JSON.stringify(response.data,null,2)
            );
            return response.data;
        }
        throw new Error('Invalid response format from Jupiter API');
    } catch(error) {
        console.error(chalk.red('Error fetching trending tokens:'),error.message);

        // Try to load from cache if available
        try {
            if(fs.existsSync(path.join('./temp','trending-tokens.json'))) {
                const cachedData = JSON.parse(
                    fs.readFileSync(path.join('./temp','trending-tokens.json'),'utf8')
                );
                console.log(chalk.yellow('Using cached token data due to fetch error'));
                return cachedData;
            }
        } catch(cacheError) {
            console.error(chalk.red('Could not load cached token data:'),cacheError.message);
        }

        throw error;
    }
};

/**
 * Gets USDC token information
 * @returns {Object} USDC token information
 */
const getUSDCToken = () => {
    return {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
        tags: ['stablecoin']
    };
};

module.exports = {
    fetchTrendingTokens,
    getUSDCToken,
    createTempDir
}; 