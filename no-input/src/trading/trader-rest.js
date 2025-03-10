const EventEmitter = require('events');
const axios = require('axios');
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const JSBI = require('jsbi');

/**
 * Main trader class that handles trading operations using Jupiter REST API
 */
class Trader extends EventEmitter {
  constructor(config, trendingTokensTracker = null) {
    super();
    this.config = config;
    this.isRunning = false;
    this.lastUpdate = null;
    this.currentPrices = {};
    this.opportunities = [];
    this.connection = null;
    this.wallet = null;
    this.balances = {};
    this.trendingTokensTracker = trendingTokensTracker;

    // Jupiter API endpoints
    this.jupiterBaseUrl = 'https://quote-api.jup.ag/v4';
    
    // Convert update interval to milliseconds
    this.updateIntervalMs = parseInt(this.config.updateInterval, 10);
  }

  /**
   * Initialize the trader
   */
  async initialize() {
    try {
      // Create connection to the blockchain
      this.connection = new Connection(this.config.rpcUrl, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true
      });

      // Initialize wallet from private key
      if (!this.config.privateKey) {
        throw new Error('Private key is required');
      }

      this.wallet = Keypair.fromSecretKey(bs58.decode(this.config.privateKey));

      // Check wallet balances
      await this.checkBalances();
      return true;
    } catch (error) {
      console.error('Initialization error:', error);
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

      // If tokens of interest are specified, check their balances
      if (this.config.mintAddress) {
        try {
          const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
            this.wallet.publicKey,
            { mint: new PublicKey(this.config.mintAddress) }
          );

          if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            this.balances[this.config.mintAddress] = balance;
          } else {
            this.balances[this.config.mintAddress] = 0;
          }
        } catch (error) {
          console.error(`Error fetching token balance:`, error);
        }
      }

      return this.balances;
    } catch (error) {
      console.error('Error checking balances:', error);
      throw error;
    }
  }

  /**
   * Start the trading loop
   */
  async startTrading() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start the main trading loop
    this.tradingInterval = setInterval(() => {
      this.updateCycle().catch(err => {
        console.error('Error in update cycle:', err);
      });
    }, this.updateIntervalMs);

    // Run the first cycle immediately
    await this.updateCycle();
  }

  /**
   * Stop the trading loop
   */
  stopTrading() {
    if (!this.isRunning) {
      return;
    }

    clearInterval(this.tradingInterval);
    this.isRunning = false;
  }

  /**
   * Main update cycle that runs on each interval
   */
  async updateCycle() {
    this.lastUpdate = new Date();

    try {
      // 1. Fetch current prices
      await this.fetchPrices();

      // 2. Check trending tokens if enabled
      if (this.config.fetchTrendingTokens && this.config.tradeTrendingTokens && this.trendingTokensTracker) {
        await this.checkTrendingTokenOpportunities();
      }

      // 3. Find trading opportunities
      await this.findOpportunities();

      // 4. Execute trades if enabled
      if (this.config.tradingEnabled && this.opportunities.length > 0) {
        await this.executeTrades();
      }
    } catch (error) {
      console.error('Error in update cycle:', error);
    }
  }

  /**
   * Get price quote from Jupiter API
   */
  async getJupiterQuote(inputMint, outputMint, amount, slippageBps = 50) {
    try {
      const response = await axios.get(`${this.jupiterBaseUrl}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
      throw error;
    }
  }

  /**
   * Get swap instructions from Jupiter API
   */
  async getJupiterSwap(route, userPublicKey) {
    try {
      const response = await axios.post(`${this.jupiterBaseUrl}/swap`, {
        route,
        userPublicKey: userPublicKey.toString()
      });
      return response.data;
    } catch (error) {
      console.error('Error getting swap instructions:', error);
      throw error;
    }
  }

  /**
   * Fetch current token prices
   */
  async fetchPrices() {
    try {
      // Define base tokens for price checking
      const baseTokens = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
      // USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
      // SOL (wrapped): So11111111111111111111111111111111111111112

      this.currentPrices = {};

      // If we have a specific token of interest, add it to our price checks
      if (this.config.mintAddress && !baseTokens.includes(this.config.mintAddress)) {
        baseTokens.push(this.config.mintAddress);
      }

      // Check price of SOL in USDC
      const amountInLamports = '1000000000'; // 1 SOL in lamports
      const solToUsdcQuote = await this.getJupiterQuote(
        'So11111111111111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amountInLamports,
        10
      );

      if (solToUsdcQuote && solToUsdcQuote.outAmount) {
        const price = parseFloat(solToUsdcQuote.outAmount) / 1_000_000; // USDC has 6 decimals
        this.currentPrices['SOL/USDC'] = price;
        this.currentPrices['WSOL/USDC'] = price;
        console.log(`PRICE | SOL/USDC | $${price.toFixed(2)} | Jupiter`);
      }

      // If we have a specific token, check its price in USDC
      if (this.config.mintAddress && this.config.mintAddress !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        try {
          // Get token info to determine decimals
          const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(this.config.mintAddress));
          const tokenDecimals = tokenInfo.value?.data.parsed.info.decimals || 9;
          const tokenAmountInSmallestUnit = Math.pow(10, tokenDecimals).toString();

          // Token to USDC price
          const tokenToUsdcQuote = await this.getJupiterQuote(
            this.config.mintAddress,
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            tokenAmountInSmallestUnit,
            10
          );

          if (tokenToUsdcQuote && tokenToUsdcQuote.outAmount) {
            const price = parseFloat(tokenToUsdcQuote.outAmount) / 1_000_000; // USDC has 6 decimals
            this.currentPrices[`${this.config.mintAddress}/USDC`] = price;
            console.log(`PRICE | ${this.config.mintAddress}/USDC | $${price.toFixed(6)} | Jupiter`);
          }
        } catch (error) {
          console.error(`Error fetching price for ${this.config.mintAddress}:`, error);
        }
      }

      return this.currentPrices;
    } catch (error) {
      console.error('Error fetching prices:', error);
      throw error;
    }
  }

  /**
   * Find trading opportunities based on current prices
   */
  async findOpportunities() {
    // Clear previous opportunities
    this.opportunities = [];

    try {
      // Define parameters for opportunity calculation
      const tokenA = this.config.mintAddress || 'So11111111111111111111111111111111111111112'; // Default to SOL if not specified
      const tokenB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

      // Get token info to determine decimals
      const tokenAInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenA));
      const tokenADecimals = tokenA === 'So11111111111111111111111111111111111111112' ? 9 : tokenAInfo.value?.data.parsed.info.decimals || 9;

      // Amount to trade (in smallest units)
      const amountToTrade = (this.config.tradeSizeSol * Math.pow(10, tokenADecimals)).toString();

      // Get quote for a potential trade
      const quote = await this.getJupiterQuote(
        tokenA,
        tokenB,
        amountToTrade,
        parseInt(this.config.slippage, 10) || 50
      );

      if (quote && quote.outAmount) {
        // Calculate expected output amount in human-readable format
        const expectedOutputAmount = parseFloat(quote.outAmount) / Math.pow(10, 6); // USDC has 6 decimals

        // Calculate the input amount in USD for comparison
        const inputAmountUSD = this.config.tradeSizeSol * (this.currentPrices['SOL/USDC'] || 0);

        // Calculate potential profit percentage
        const potentialProfit = ((expectedOutputAmount - inputAmountUSD) / inputAmountUSD) * 100;

        if (potentialProfit > this.config.minProfitThreshold) {
          const opportunity = {
            type: 'standard',
            fromToken: tokenA === 'So11111111111111111111111111111111111111112' ? 'SOL' : tokenA,
            toToken: 'USDC',
            quote: quote,
            inputAmount: this.config.tradeSizeSol,
            expectedOutputAmount,
            potentialProfit,
            estimatedValue: expectedOutputAmount - inputAmountUSD,
          };

          this.opportunities.push(opportunity);
          console.log(`OPPORTUNITY | ${opportunity.fromToken}/USDC | ${potentialProfit.toFixed(2)}% | $${opportunity.estimatedValue.toFixed(2)}`);
        }
      }

      return this.opportunities;
    } catch (error) {
      console.error('Error finding opportunities:', error);
      throw error;
    }
  }

  /**
   * Execute trades for the identified opportunities
   */
  async executeTrades() {
    if (!this.config.tradingEnabled) {
      return;
    }

    if (this.opportunities.length === 0) {
      return;
    }

    for (const opportunity of this.opportunities) {
      try {
        console.log(`SWAP | ${opportunity.fromToken}→${opportunity.toToken} | ${opportunity.inputAmount} ${opportunity.fromToken}`);

        // Get swap instructions
        const swapData = await this.getJupiterSwap(
          opportunity.quote,
          this.wallet.publicKey
        );

        if (!swapData || !swapData.swapTransaction) {
          console.error('Failed to get swap transaction');
          continue;
        }

        // Deserialize and sign the transaction
        const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const transaction = Transaction.from(swapTransactionBuf);
        
        // Sign the transaction
        transaction.partialSign(this.wallet);

        // Send the transaction
        const txid = await this.connection.sendRawTransaction(
          transaction.serialize(),
          { skipPreflight: false, preflightCommitment: 'confirmed' }
        );

        console.log(`TX | ${txid} | Expected output: ${opportunity.expectedOutputAmount} USDC | Profit: $${opportunity.estimatedValue.toFixed(2)}`);

        // Emit success event
        this.emit('tradingSuccess', {
          ...opportunity,
          txid: txid,
        });

        // Update balances after successful trade
        await this.checkBalances();

      } catch (error) {
        console.error(`Error executing trade:`, error);
        this.emit('tradingError', error);
      }

      // Add a small delay between trades to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

module.exports = Trader; 