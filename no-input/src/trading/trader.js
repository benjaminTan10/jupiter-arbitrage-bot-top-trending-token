const EventEmitter = require('events');
const {Jupiter} = require('@jup-ag/core');
const {Connection,Keypair,PublicKey} = require('@solana/web3.js');
const bs58 = require('bs58');
const JSBI = require('jsbi');

// Helper function to adapt to Jupiter v2 API
async function getJupiterRoutes(jupiter,inputMint,outputMint,amount,slippageBps) {
  // For Jupiter v2
  if(jupiter.exchange) {
    return jupiter.computeRoutes({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      forceFetch: true
    });
  }

  // For older Jupiter versions
  return jupiter.route({
    inputMint,
    outputMint,
    amount,
    slippage: slippageBps / 100,
    forceFetch: true
  });
}

/**
 * Main trader class that handles trading operations
 */
class Trader extends EventEmitter {
  constructor(config,trendingTokensTracker = null) {
    super();
    this.config = config;
    this.isRunning = false;
    this.lastUpdate = null;
    this.currentPrices = {};
    this.opportunities = [];
    this.connection = null;
    this.jupiter = null;
    this.wallet = null;
    this.balances = {};
    this.trendingTokensTracker = trendingTokensTracker;

    // Convert update interval to milliseconds
    this.updateIntervalMs = parseInt(this.config.updateInterval,10);
  }

  /**
   * Initialize the trader
   */
  async initialize() {
    console.log('Initializing trader...');

    try {
      // Create connection to the blockchain
      this.connection = new Connection(this.config.rpcUrl,{
        commitment: 'confirmed',
        disableRetryOnRateLimit: true
      });

      // Initialize wallet from private key
      if(!this.config.privateKey) {
        throw new Error('Private key is required');
      }

      this.wallet = Keypair.fromSecretKey(bs58.decode(this.config.privateKey));
      console.log(`Wallet initialized: ${this.wallet.publicKey.toString()}`);

      // Initialize Jupiter SDK
      this.jupiter = await Jupiter.load({
        connection: this.connection,
        cluster: this.config.network || 'mainnet-beta',
        user: this.wallet,
        wrapUnwrapSOL: this.config.wrapUnwrapSol
      });

      // Check wallet balances
      await this.checkBalances();

      console.log('Trader initialized successfully');
      return true;
    } catch(error) {
      console.error('Initialization error:',error);
      throw error;
    }
  }

  /**
   * Check wallet balances for tokens of interest
   */
  async checkBalances() {
    try {
      // Check SOL balance
      const solBalance = await this.connection.getBalance(this.wallet.publicKey);
      this.balances.SOL = solBalance / 1e9; // Convert lamports to SOL

      console.log(`SOL Balance: ${this.balances.SOL}`);

      // If tokens of interest are specified, check their balances
      if(this.config.mintAddress) {
        try {
          const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            this.wallet.publicKey,
            {mint: new PublicKey(this.config.mintAddress)}
          );

          if(tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            this.balances[this.config.mintAddress] = balance;
            console.log(`Token Balance (${this.config.mintAddress}): ${balance}`);
          } else {
            this.balances[this.config.mintAddress] = 0;
            console.log(`No token account found for ${this.config.mintAddress}`);
          }
        } catch(error) {
          console.error(`Error fetching token balance for ${this.config.mintAddress}:`,error);
        }
      }

      return this.balances;
    } catch(error) {
      console.error('Error checking balances:',error);
      throw error;
    }
  }

  /**
   * Start the trading loop
   */
  async startTrading() {
    if(this.isRunning) {
      console.log('Trading already running');
      return;
    }

    console.log(`Starting trading with update interval: ${this.updateIntervalMs}ms`);
    this.isRunning = true;

    // Start the main trading loop
    this.tradingInterval = setInterval(() => {
      this.updateCycle().catch(err => {
        console.error('Error in update cycle:',err);
      });
    },this.updateIntervalMs);

    // Run the first cycle immediately
    await this.updateCycle();
  }

  /**
   * Stop the trading loop
   */
  stopTrading() {
    if(!this.isRunning) {
      console.log('Trading already stopped');
      return;
    }

    console.log('Stopping trading');
    clearInterval(this.tradingInterval);
    this.isRunning = false;
  }

  /**
   * Main update cycle that runs on each interval
   */
  async updateCycle() {
    this.lastUpdate = new Date();
    console.log(`Update cycle started at ${this.lastUpdate.toISOString()}`);

    try {
      // 1. Fetch current prices
      await this.fetchPrices();

      // 2. Check trending tokens if enabled
      if(this.config.fetchTrendingTokens && this.config.tradeTrendingTokens && this.trendingTokensTracker) {
        await this.checkTrendingTokenOpportunities();
      }

      // 3. Find trading opportunities
      await this.findOpportunities();

      // 4. Execute trades if enabled
      if(this.config.tradingEnabled && this.opportunities.length > 0) {
        await this.executeTrades();
      }
    } catch(error) {
      console.error('Error in update cycle:',error);
    }

    console.log(`Update cycle completed. Next update in ${this.updateIntervalMs}ms`);
  }

  /**
   * Fetch current prices from Jupiter
   */
  async fetchPrices() {
    console.log('Fetching current prices...');

    try {
      // Define base tokens for price checking
      const baseTokens = ['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
      // USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
      // SOL (wrapped): So11111111111111111111111111111111111111112

      this.currentPrices = {};

      // If we have a specific token of interest, add it to our price checks
      if(this.config.mintAddress && !baseTokens.includes(this.config.mintAddress)) {
        baseTokens.push(this.config.mintAddress);
      }

      // Check price of SOL in USDC
      const amountInLamports = JSBI.BigInt(1_000_000_000); // 1 SOL in lamports
      const solToUsdcRoutes = await getJupiterRoutes(this.jupiter,new PublicKey('So11111111111111111111111111111111111111112'),new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),amountInLamports,10);

      if(solToUsdcRoutes.routesInfos && solToUsdcRoutes.routesInfos.length > 0) {
        const bestRoute = solToUsdcRoutes.routesInfos[0];
        const price = parseFloat(bestRoute.outAmount) / 1_000_000; // USDC has 6 decimals
        this.currentPrices['SOL/USDC'] = price;
        this.currentPrices['WSOL/USDC'] = price;
      }

      // If we have a specific token, check its price in USDC and SOL
      if(this.config.mintAddress && this.config.mintAddress !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        try {
          // Get token info to determine decimals
          const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(this.config.mintAddress));
          const tokenDecimals = tokenInfo.value?.data.parsed.info.decimals || 9;
          const tokenAmountInSmallestUnit = JSBI.BigInt(Math.pow(10,tokenDecimals));

          // Token to USDC price
          const tokenToUsdcRoutes = await getJupiterRoutes(this.jupiter,new PublicKey(this.config.mintAddress),new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),tokenAmountInSmallestUnit,10);

          if(tokenToUsdcRoutes.routesInfos && tokenToUsdcRoutes.routesInfos.length > 0) {
            const bestRoute = tokenToUsdcRoutes.routesInfos[0];
            const price = parseFloat(bestRoute.outAmount) / 1_000_000; // USDC has 6 decimals
            this.currentPrices[`${this.config.mintAddress}/USDC`] = price;
          }
        } catch(error) {
          console.error(`Error fetching price for ${this.config.mintAddress}:`,error);
        }
      }

      console.log('Current prices:',this.currentPrices);
      return this.currentPrices;
    } catch(error) {
      console.error('Error fetching prices:',error);
      throw error;
    }
  }

  /**
   * Check trending tokens for trading opportunities
   */
  async checkTrendingTokenOpportunities() {
    if(!this.trendingTokensTracker) {
      console.log('Trending tokens tracker not available');
      return;
    }

    console.log('Checking trending tokens for opportunities...');

    try {
      // Get top trending tokens
      const trendingTokens = this.trendingTokensTracker.getTopTrendingTokens();

      if(trendingTokens.length === 0) {
        console.log('No trending tokens available');
        return;
      }

      console.log(`Found ${trendingTokens.length} trending tokens to analyze`);

      // WSOL address for pool pairing
      const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112';
      const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      // The amount of SOL to use in price checks (in smallest unit)
      const tradeAmountSol = JSBI.BigInt(this.config.tradeSizeSol * 1e9); // Convert SOL to lamports

      for(const token of trendingTokens) {
        try {
          console.log(`Analyzing trending token: ${token.symbol} (${token.address})`);

          // Check price of token/WSOL
          try {
            // Get token decimals
            const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(token.address));
            const tokenDecimals = token.decimals || tokenInfo.value?.data.parsed.info.decimals || 9;
            const oneToken = JSBI.BigInt(Math.pow(10,tokenDecimals));

            // Get price of token in SOL
            const tokenToSolRoutes = await getJupiterRoutes(this.jupiter,new PublicKey(token.address),new PublicKey(WSOL_ADDRESS),oneToken,50);

            if(tokenToSolRoutes.routesInfos && tokenToSolRoutes.routesInfos.length > 0) {
              const bestRoute = tokenToSolRoutes.routesInfos[0];
              const tokenPriceInSol = parseFloat(bestRoute.outAmount) / 1e9;
              this.currentPrices[`${token.address}/WSOL`] = tokenPriceInSol;

              console.log(`Token ${token.symbol} price in SOL: ${tokenPriceInSol}`);

              // Also check token price in USDC for profit calculation
              const tokenToUsdcRoutes = await getJupiterRoutes(this.jupiter,new PublicKey(token.address),new PublicKey(USDC_ADDRESS),oneToken,50);

              if(tokenToUsdcRoutes.routesInfos && tokenToUsdcRoutes.routesInfos.length > 0) {
                const bestUsdcRoute = tokenToUsdcRoutes.routesInfos[0];
                const tokenPriceInUsdc = parseFloat(bestUsdcRoute.outAmount) / 1e6;
                this.currentPrices[`${token.address}/USDC`] = tokenPriceInUsdc;

                console.log(`Token ${token.symbol} price in USDC: ${tokenPriceInUsdc}`);

                // Check for arbitrage opportunity
                const solPrice = this.currentPrices['SOL/USDC'] || 0;

                // Calculate potential profit from SOL -> token -> USDC -> SOL cycle
                const solToTokenRoutes = await getJupiterRoutes(this.jupiter,new PublicKey(WSOL_ADDRESS),new PublicKey(token.address),tradeAmountSol,50);

                if(solToTokenRoutes.routesInfos && solToTokenRoutes.routesInfos.length > 0) {
                  const bestTokenRoute = solToTokenRoutes.routesInfos[0];
                  const expectedTokens = JSBI.BigInt(bestTokenRoute.outAmount);

                  // Now check what we'd get by converting these tokens to USDC
                  const tokenToUsdcRoutes = await getJupiterRoutes(this.jupiter,new PublicKey(token.address),new PublicKey(USDC_ADDRESS),expectedTokens,50);

                  if(tokenToUsdcRoutes.routesInfos && tokenToUsdcRoutes.routesInfos.length > 0) {
                    const bestUsdcRoute = tokenToUsdcRoutes.routesInfos[0];
                    const expectedUsdc = parseFloat(bestUsdcRoute.outAmount) / 1e6;

                    // Calculate profit
                    const inputSol = parseFloat(tradeAmountSol) / 1e9;
                    const inputValueUsdc = inputSol * solPrice;
                    const profitUsdc = expectedUsdc - inputValueUsdc;
                    const profitPercentage = (profitUsdc / inputValueUsdc) * 100;

                    console.log(`Potential profit for ${token.symbol}: $${profitUsdc.toFixed(2)} (${profitPercentage.toFixed(2)}%)`);

                    // If profit meets threshold, add as opportunity
                    if(profitPercentage > this.config.minProfitThreshold) {
                      const opportunity = {
                        type: 'trending',
                        fromToken: 'SOL',
                        toToken: token.symbol,
                        tokenAddress: token.address,
                        route: bestTokenRoute,
                        secondRoute: bestUsdcRoute,
                        inputAmount: inputSol,
                        expectedOutputAmount: expectedUsdc,
                        potentialProfit: profitPercentage,
                        estimatedValue: profitUsdc,
                        source: token.source || 'trending',
                      };

                      this.opportunities.push(opportunity);
                      console.log(`Added trending token opportunity for ${token.symbol} with ${profitPercentage.toFixed(2)}% profit`);
                    }
                  }
                }
              }
            }
          } catch(error) {
            console.error(`Error checking trending token ${token.symbol}:`,error.message);
          }

          // Add a small delay between tokens to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve,200));
        } catch(error) {
          console.error(`Error processing trending token ${token.symbol}:`,error.message);
        }
      }

      console.log(`Finished analyzing trending tokens. Found ${this.opportunities.length} opportunities.`);

    } catch(error) {
      console.error('Error checking trending token opportunities:',error);
    }
  }

  /**
   * Find trading opportunities based on current prices
   */
  async findOpportunities() {
    console.log('Finding trading opportunities...');

    // We don't clear previous opportunities here as we want to keep trending token opportunities
    // Only clear if you don't want to combine different types of opportunities
    // this.opportunities = [];

    try {
      // Define parameters for opportunity calculation
      const tokenA = this.config.mintAddress || 'So11111111111111111111111111111111111111112'; // Default to SOL if not specified
      const tokenB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

      // Get token info to determine decimals
      const tokenAInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenA));
      const tokenADecimals = tokenA === 'So11111111111111111111111111111111111111112' ? 9 : tokenAInfo.value?.data.parsed.info.decimals || 9;

      // Amount to trade (in smallest units)
      const amountToTrade = JSBI.BigInt(this.config.tradeSizeSol * Math.pow(10,tokenADecimals));

      // Compute routes for a potential trade
      const routes = await getJupiterRoutes(this.jupiter,new PublicKey(tokenA),new PublicKey(tokenB),amountToTrade,parseInt(this.config.slippage,10) || 50);

      if(routes.routesInfos && routes.routesInfos.length > 0) {
        const bestRoute = routes.routesInfos[0];

        // Calculate expected output amount in human-readable format
        const expectedOutputAmount = parseFloat(bestRoute.outAmount) / Math.pow(10,6); // USDC has 6 decimals

        // Calculate the input amount in USD for comparison
        const inputAmountUSD = this.config.tradeSizeSol * (this.currentPrices['SOL/USDC'] || 0);

        // Calculate potential profit percentage
        const potentialProfit = ((expectedOutputAmount - inputAmountUSD) / inputAmountUSD) * 100;

        if(potentialProfit > this.config.minProfitThreshold) {
          const opportunity = {
            type: 'standard',
            fromToken: tokenA === 'So11111111111111111111111111111111111111112' ? 'SOL' : tokenA,
            toToken: 'USDC',
            route: bestRoute,
            inputAmount: this.config.tradeSizeSol,
            expectedOutputAmount,
            potentialProfit,
            estimatedValue: expectedOutputAmount - inputAmountUSD,
          };

          this.opportunities.push(opportunity);
          console.log('Found standard opportunity:',opportunity);
        } else {
          console.log(`No profitable standard opportunity found. Potential profit: ${potentialProfit.toFixed(2)}%, minimum threshold: ${this.config.minProfitThreshold}%`);
        }
      } else {
        console.log('No routes found for the specified tokens');
      }

      // Sort opportunities by potential profit (highest first)
      this.opportunities.sort((a,b) => b.potentialProfit - a.potentialProfit);

      return this.opportunities;
    } catch(error) {
      console.error('Error finding opportunities:',error);
      throw error;
    }
  }

  /**
   * Execute trades for the identified opportunities
   */
  async executeTrades() {
    if(!this.config.tradingEnabled) {
      console.log('Trading is disabled, skipping execution');
      return;
    }

    if(this.opportunities.length === 0) {
      console.log('No opportunities to execute');
      return;
    }

    console.log(`Executing ${this.opportunities.length} trades...`);

    for(const opportunity of this.opportunities) {
      try {
        console.log(`Executing trade: ${opportunity.fromToken} -> ${opportunity.toToken}`);

        if(opportunity.type === 'trending' && opportunity.secondRoute) {
          // For trending token opportunities, we need two transactions
          console.log(`Trending token trade: SOL -> ${opportunity.toToken} -> USDC`);

          // First transaction: SOL -> Trending Token
          const {execute: execute1} = await getJupiterRoutes(this.jupiter,opportunity.route,opportunity.secondRoute);

          const result1 = await execute1();

          if(result1.error) {
            console.error('First transaction failed:',result1.error);
            this.emit('tradingError',new Error(result1.error.message || 'First transaction failed'));
            continue;
          }

          console.log(`First transaction successful! Txid: ${result1.txid}`);
          console.log(`Received ${result1.outputAmount} ${opportunity.toToken}`);

          // Wait a moment before second transaction
          await new Promise(resolve => setTimeout(resolve,2000));

          // Second transaction: Trending Token -> USDC
          const {execute: execute2} = await getJupiterRoutes(this.jupiter,opportunity.secondRoute,opportunity.route);

          const result2 = await execute2();

          if(result2.error) {
            console.error('Second transaction failed:',result2.error);
            this.emit('tradingError',new Error(result2.error.message || 'Second transaction failed'));
            continue;
          }

          console.log(`Second transaction successful! Txid: ${result2.txid}`);
          console.log(`Received ${result2.outputAmount} USDC`);

          // Calculate actual profit
          const inputValueUsdc = opportunity.inputAmount * (this.currentPrices['SOL/USDC'] || 0);
          const outputValueUsdc = parseFloat(result2.outputAmount) / 1e6;
          const actualProfit = outputValueUsdc - inputValueUsdc;
          const actualProfitPercentage = (actualProfit / inputValueUsdc) * 100;

          console.log(`Complete trade cycle successful!`);
          console.log(`Input: ${opportunity.inputAmount} SOL (≈$${inputValueUsdc.toFixed(2)})`);
          console.log(`Output: ${outputValueUsdc.toFixed(2)} USDC`);
          console.log(`Actual Profit: $${actualProfit.toFixed(2)} (${actualProfitPercentage.toFixed(2)}%)`);

          // Emit success event
          this.emit('tradingSuccess',{
            ...opportunity,
            txid1: result1.txid,
            txid2: result2.txid,
            actualOutputAmount: outputValueUsdc,
            actualProfit,
            actualProfitPercentage
          });

        } else {
          // Standard opportunity
          // Prepare the transaction
          const {execute} = await getJupiterRoutes(this.jupiter,opportunity.route,opportunity.route);

          // Execute the transaction
          const result = await execute();

          if(result.error) {
            console.error('Trade execution failed:',result.error);
            this.emit('tradingError',new Error(result.error.message || 'Transaction failed'));
          } else {
            console.log(`Trade executed successfully! Txid: ${result.txid}`);
            console.log(`Input amount: ${opportunity.inputAmount} ${opportunity.fromToken}`);
            console.log(`Output amount: ${result.outputAmount} ${opportunity.toToken}`);
            console.log(`Profit: $${opportunity.estimatedValue.toFixed(2)}`);

            // Emit success event
            this.emit('tradingSuccess',{
              ...opportunity,
              txid: result.txid,
              actualOutputAmount: result.outputAmount,
            });
          }
        }

        // Update balances after successful trade
        await this.checkBalances();

        // Add a small delay between trades to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve,1000));
      } catch(error) {
        console.error(`Error executing trade:`,error);
        this.emit('tradingError',error);
      }
    }

    // Clear opportunities after execution
    this.opportunities = [];
  }
}

module.exports = Trader; 