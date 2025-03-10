const EventEmitter = require('events');
const {Jupiter} = require('@jup-ag/core');
const {Connection,Keypair,PublicKey} = require('@solana/web3.js');
const bs58 = require('bs58');
const JSBI = require('jsbi');

/**
 * Main trader class that handles trading operations
 */
class Trader extends EventEmitter {
  constructor(config) {
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

      // 2. Find trading opportunities
      await this.findOpportunities();

      // 3. Execute trades if enabled
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
      const solToUsdcRoutes = await this.jupiter.computeRoutes({
        inputMint: new PublicKey('So11111111111111111111111111111111111111112'),
        outputMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        amount: amountInLamports,
        slippageBps: 10, // 0.1%
        forceFetch: true,
      });

      if(solToUsdcRoutes.routesInfos && solToUsdcRoutes.routesInfos.length > 0) {
        const bestRoute = solToUsdcRoutes.routesInfos[0];
        const price = parseFloat(bestRoute.outAmount) / 1_000_000; // USDC has 6 decimals
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
          const tokenToUsdcRoutes = await this.jupiter.computeRoutes({
            inputMint: new PublicKey(this.config.mintAddress),
            outputMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
            amount: tokenAmountInSmallestUnit,
            slippageBps: 10,
            forceFetch: true,
          });

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
   * Find trading opportunities based on current prices
   */
  async findOpportunities() {
    console.log('Finding trading opportunities...');

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
      const amountToTrade = JSBI.BigInt(this.config.tradeSizeSol * Math.pow(10,tokenADecimals));

      // Compute routes for a potential trade
      const routes = await this.jupiter.computeRoutes({
        inputMint: new PublicKey(tokenA),
        outputMint: new PublicKey(tokenB),
        amount: amountToTrade,
        slippageBps: parseInt(this.config.slippage,10) || 50,
        forceFetch: true,
      });

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
            fromToken: tokenA === 'So11111111111111111111111111111111111111112' ? 'SOL' : tokenA,
            toToken: 'USDC',
            route: bestRoute,
            inputAmount: this.config.tradeSizeSol,
            expectedOutputAmount,
            potentialProfit,
            estimatedValue: expectedOutputAmount - inputAmountUSD,
          };

          this.opportunities.push(opportunity);
          console.log('Found opportunity:',opportunity);
        } else {
          console.log(`No profitable opportunity found. Potential profit: ${potentialProfit.toFixed(2)}%, minimum threshold: ${this.config.minProfitThreshold}%`);
        }
      } else {
        console.log('No routes found for the specified tokens');
      }

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

        // Prepare the transaction
        const {execute} = await this.jupiter.exchange({
          routeInfo: opportunity.route,
        });

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

          // Update balances after successful trade
          await this.checkBalances();
        }

        // Add a small delay between trades to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve,1000));
      } catch(error) {
        console.error(`Error executing trade:`,error);
        this.emit('tradingError',error);
      }
    }
  }
}

module.exports = Trader; 