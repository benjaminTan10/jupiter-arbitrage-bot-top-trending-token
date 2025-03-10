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
    } catch (error) {
      console.error('Error checking balances:', error);
    }
  }

  /**
   * Start trading cycle
   */
  async startTrading() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Run immediately on start
    await this.updateCycle();
    
    // Set up interval for ongoing updates
    this.updateInterval = setInterval(async () => {
      await this.updateCycle();
    }, this.updateIntervalMs);
  }
  
  /**
   * Stop trading
   */
  stopTrading() {
    if (!this.isRunning) {
      return;
    }
    
    clearInterval(this.updateInterval);
    this.isRunning = false;
  }
  
  /**
   * Main update cycle - fetch prices, find opportunities, execute trades
   */
  async updateCycle() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      this.lastUpdate = new Date();
      
      // 1. Fetch current prices
      await this.fetchPrices();
      
      // 2. Identify trading opportunities
      await this.findOpportunities();
      
      // 3. Execute trades if enabled
      await this.executeTrades();
      
    } catch (error) {
      console.error('Update cycle error:', error);
    }
  }

  /**
   * Fetch current token prices
   */
  async fetchPrices() {
    try {
      // Get SOL/USDC price for reference
      try {
        const solToUsdcQuote = await this.getJupiterQuote(
          'So11111111111111111111111111111111111111112', // SOL mint
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
          1_000_000_000 // 1 SOL in lamports
        );
        
        if (solToUsdcQuote && solToUsdcQuote.outAmount) {
          const price = parseFloat(solToUsdcQuote.outAmount) / 1_000_000; // USDC has 6 decimals
          this.currentPrices['SOL/USDC'] = price;
          this.currentPrices['WSOL/USDC'] = price;
          console.log(`PRICE | SOL/USDC | $${price.toFixed(2)} | Jupiter`);
        }
      } catch (error) {
        // Handle errors quietly
      }
      
      // Get token/USDC price if we have a specific token
      if (this.config.mintAddress) {
        try {
          const tokenToUsdcQuote = await this.getJupiterQuote(
            this.config.mintAddress,
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
            Math.pow(10, this.config.tokenDecimals || 6) // 1 token in its smallest units
          );
          
          if (tokenToUsdcQuote && tokenToUsdcQuote.outAmount) {
            const price = parseFloat(tokenToUsdcQuote.outAmount) / 1_000_000; // USDC has 6 decimals
            this.currentPrices[`${this.config.mintAddress}/USDC`] = price;
            console.log(`PRICE | ${this.config.tokenSymbol || this.config.mintAddress}/USDC | $${price.toFixed(6)} | Jupiter`);
          }
        } catch (error) {
          // Handle errors quietly
        }
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  }

  /**
   * Get a quote from Jupiter API
   */
  async getJupiterQuote(inputMint, outputMint, amount, slippageBps = 10) {
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
      // Handle errors quietly
      return null;
    }
  }

  /**
   * Find arbitrage opportunities
   */
  async findOpportunities() {
    // Reset opportunities
    this.opportunities = [];

    if (!this.trendingTokensTracker || !this.config.tradingEnabled) {
      return;
    }

    const trendingTokens = this.trendingTokensTracker.trendingTokens;
    
    for (const token of trendingTokens) {
      try {
        // Check if there's a price imbalance
        if (this.config.strategyType === 'arbitrage') {
          const opportunity = await this.checkArbitrageOpportunity(token);
          if (opportunity) {
            console.log(`OPPORTUNITY | ${opportunity.fromToken}→${opportunity.toToken} | Est. Profit: $${opportunity.estimatedValue.toFixed(2)}`);
            this.opportunities.push(opportunity);
          }
        }
      } catch (error) {
        // Handle errors quietly
      }
    }
    
    // Sort opportunities by estimated value (highest first)
    this.opportunities.sort((a, b) => b.estimatedValue - a.estimatedValue);
    
    // Limit to max opportunities
    if (this.opportunities.length > this.config.maxOpportunities) {
      this.opportunities = this.opportunities.slice(0, this.config.maxOpportunities);
    }
  }

  /**
   * Get swap transaction data from Jupiter API
   */
  async getJupiterSwap(quoteResponse, userPublicKey) {
    try {
      const response = await axios.post(`${this.jupiterBaseUrl}/swap`, {
        quoteResponse,
        userPublicKey: userPublicKey.toString(),
        wrapUnwrapSOL: true
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting swap transaction:', error);
      return null;
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

        console.log(`TX | ${txid} | Expected output: ${opportunity.expectedOutputAmount} ${opportunity.toToken} | Profit: $${opportunity.estimatedValue.toFixed(2)}`);

        // Emit success event
        this.emit('tradingSuccess', {
          ...opportunity,
          txid: txid,
        });

        // Update balances after successful trade
        await this.checkBalances();

      } catch (error) {
        // Only log serious errors
        if (error.message && error.message.includes('blockhash')) {
          console.error(`Blockchain error: ${error.message}`);
        }
      }

      // Add a small delay between trades to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

module.exports = Trader; 