const { PublicKey } = require('@solana/web3.js');
const JSBI = require('jsbi');
const fs = require('fs');
const path = require('path');
const { createTempDir } = require('../utils');
const chalk = require('chalk');

// Standard token amount to use for quotes (0.1 SOL equivalent)
const QUOTE_AMOUNT = JSBI.BigInt(100000000); // 0.1 * 10^9

/**
 * Gets prices for a token across all available DEXes
 * @param {Object} jupiter - Initialized Jupiter instance
 * @param {Object} token - Token object with address and decimals
 * @param {Object} baseToken - Base token (usually SOL) to quote against
 * @returns {Promise<Object>} Prices by DEX
 */
const getTokenPricesAcrossDEXes = async (jupiter, token, baseToken) => {
  try {
    console.log(`Getting prices for ${token.symbol} (${token.address}) across all DEXes...`);
    
    // Configure route computation to split by AMM
    const routesRequest = {
      inputMint: new PublicKey(baseToken.address),
      outputMint: new PublicKey(token.address),
      amount: QUOTE_AMOUNT,
      slippageBps: 50, // 0.5%
      onlyDirectRoutes: false,
      filterTopNResult: 100, // Get all results so we can see different DEXes
      asLegacyTransaction: false,
      splitByRpcs: true, // Directly split by DEX
      displayCuts: true,
      includePlatformFees: false,
      excludeMarketMakers: true,
    };
    
    // Compute routes to get DEX-specific pricing
    const routes = await jupiter.computeRoutes(routesRequest);
    
    // Extract DEX-specific pricing
    const pricesByDex = {};
    
    if (routes && routes.routesInfos) {
      routes.routesInfos.forEach(route => {
        // Get the AMM/DEX name
        const ammKey = route.marketInfos?.[0]?.amm?.label || 'Unknown';
        
        // Calculate price based on the outAmount for this route
        const outAmount = JSBI.toNumber(route.outAmount);
        const price = outAmount / JSBI.toNumber(QUOTE_AMOUNT) * (10 ** (baseToken.decimals - token.decimals));
        
        pricesByDex[ammKey] = {
          price,
          outAmount,
          lpFee: route.marketInfos?.[0]?.lpFee?.amount || 0,
          platformFee: route.marketInfos?.[0]?.platformFee?.amount || 0,
        };
      });
    }
    
    console.log(`Found ${Object.keys(pricesByDex).length} DEXes with prices for ${token.symbol}`);
    return pricesByDex;
  } catch (error) {
    console.error(`Error getting prices for ${token.symbol}:`, error.message);
    return {};
  }
};

/**
 * Scans all trending tokens for their prices across different DEXes
 * @param {Object} jupiter - Initialized Jupiter instance
 * @param {Array} tokens - List of tokens to scan
 * @param {Object} baseToken - Base token (usually SOL) to quote against
 * @returns {Promise<Object>} Map of token addresses to their prices by DEX
 */
const scanAllTokenPrices = async (jupiter, tokens, baseToken) => {
  console.log(`Starting price scan for ${tokens.length} tokens across all DEXes...`);
  const allPrices = {};
  
  // Process tokens in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds
  
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i/BATCH_SIZE + 1} of ${Math.ceil(tokens.length/BATCH_SIZE)}`);
    
    await Promise.all(
      batch.map(async (token) => {
        try {
          const prices = await getTokenPricesAcrossDEXes(jupiter, token, baseToken);
          if (Object.keys(prices).length > 0) {
            allPrices[token.address] = {
              symbol: token.symbol,
              name: token.name,
              prices
            };
          }
        } catch (error) {
          console.error(`Error processing ${token.symbol}:`, error.message);
        }
      })
    );
    
    // Add delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < tokens.length) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES/1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Store the results
  createTempDir();
  fs.writeFileSync(
    path.join(process.cwd(), 'temp', 'dex-prices.json'),
    JSON.stringify(allPrices, null, 2)
  );
  
  console.log(`Completed price scan. Found prices for ${Object.keys(allPrices).length} tokens`);
  return allPrices;
};

/**
 * Logs detailed token prices to help troubleshoot and optimize trading
 * @param {Object} allPrices - Map of token addresses to prices by DEX
 */
const logDetailedTokenPrices = (allPrices) => {
  if (!allPrices || Object.keys(allPrices).length === 0) {
    console.log('No token price data available to log');
    return;
  }
  
  console.log(chalk.cyan.bold(`\n===== DETAILED TOKEN PRICES FROM ${Object.keys(allPrices).length} TOKENS =====`));
  
  // Show top 5 tokens with the most price variance between DEXes
  const tokensWithVariance = [];
  
  Object.keys(allPrices).forEach(tokenAddress => {
    const token = allPrices[tokenAddress];
    const prices = token.prices;
    const dexes = Object.keys(prices);
    
    if (dexes.length >= 2) {
      // Calculate min, max, and variance
      let minPrice = Infinity;
      let maxPrice = 0;
      let minDex = '';
      let maxDex = '';
      
      dexes.forEach(dex => {
        const price = prices[dex].price;
        if (price < minPrice) {
          minPrice = price;
          minDex = dex;
        }
        if (price > maxPrice) {
          maxPrice = price;
          maxDex = dex;
        }
      });
      
      const variance = ((maxPrice / minPrice) - 1) * 100;
      
      tokensWithVariance.push({
        symbol: token.symbol,
        minPrice,
        minDex,
        maxPrice,
        maxDex,
        variance,
        dexCount: dexes.length
      });
    }
  });
  
  // Sort by variance (descending)
  tokensWithVariance.sort((a, b) => b.variance - a.variance);
  
  // Show top tokens with highest variance
  const topTokens = tokensWithVariance.slice(0, 5);
  
  topTokens.forEach((token, index) => {
    console.log(chalk.cyan.bold(`\n${index + 1}. ${token.symbol} - Listed on ${token.dexCount} DEXes with ${token.variance.toFixed(2)}% variance`));
    console.log(chalk.green(`   Lowest: ${token.minPrice.toFixed(8)} on ${token.minDex}`));
    console.log(chalk.red(`   Highest: ${token.maxPrice.toFixed(8)} on ${token.maxDex}`));
  });
  
  console.log(chalk.cyan.bold('\n================================================================\n'));
};

module.exports = { scanAllTokenPrices, getTokenPricesAcrossDEXes, logDetailedTokenPrices }; 