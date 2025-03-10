const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");
const bs58 = require("bs58");
const {Connection,Keypair,PublicKey,LAMPORTS_PER_SOL} = require("@solana/web3.js");
const JSBI = require('jsbi');

const {logExit} = require("./exit");
const {toDecimal,createTempDir} = require("../utils");
const {intro,listenHotkeys} = require("./ui");
const {setTimeout} = require("timers/promises");
const cache = require("./cache");
const {fetchTrendingTokens,getUSDCToken} = require("../utils/tokenFetcher");
const {
    jupiterQuoteApi,
    getQuote,
    checkArbitrageOpportunity
} = require("../utils/jupiterApiClient");

const wrapUnwrapSOL = cache.wrapUnwrapSOL;

// Account balance code
const balanceCheck = async (checkToken) => {
	let checkBalance = Number(0);
	let t = Number(0);

	const connection = new Connection(process.env.DEFAULT_RPC);
	wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));

	if(wrapUnwrapSOL && checkToken.address === 'So11111111111111111111111111111111111111112') {
		// This is where Native balance is needing to be checked and not the Wrapped SOL ATA
		try {
			const balance = await connection.getBalance(wallet.publicKey);
			checkBalance = Number(balance);
		} catch(error) {
			console.error('Error fetching native SOL balance:',error);
		}
	} else {
		// Normal token so look up the ATA balance(s)
		try {
			let totalTokenBalance = BigInt(0);
			const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey,{
				mint: new PublicKey(checkToken.address)
			});

			tokenAccounts.value.forEach((accountInfo) => {
				const parsedInfo = accountInfo.account.data.parsed.info;
				totalTokenBalance += BigInt(parsedInfo.tokenAmount.amount);
			});

			// Convert totalTokenBalance to a regular number
			checkBalance = Number(totalTokenBalance);

		} catch(error) {
			console.error('Error fetching token balance:',error);
		}
	}

	try {
		// Pass back the BN version to match
		let checkBalanceUi = toDecimal(checkBalance,checkToken.decimals);
		console.log(`Wallet balance for ${checkToken.symbol} is ${checkBalanceUi} (${checkBalance})`);
	} catch(error) {
		console.error('Silence is golden.. Or not...:',error);
	}

	if(checkBalance > Number(0)) {
		return checkBalance;
	} else {
		throw new Error(`Insufficient balance for ${checkToken.symbol}`);
	}
};

// Handle Balance Errors Messaging
const checkTokenABalance = async (tokenObj,requiredAmount) => {
	try {
		const realBalance = await balanceCheck(tokenObj);
		console.log('Wallet Balance:',toDecimal(String(realBalance),tokenObj.decimals),tokenObj.symbol);
		return realBalance;
	} catch(error) {
		console.error('Error looking up balance:',error);
		return -1;
	}
}

const setup = async () => {
	try {
		// Skip intro screen
		// process.env.SKIP_INTRO !== "true" && (await intro());

		// hotkeys
		listenHotkeys();

		// create temp dir
		createTempDir();

		// Load config
		let spinner;
		
		// Override trading strategy for arbitrage mode
		cache.config.tradingStrategy = "arbitrage";
		console.log(chalk.cyan("Trading Strategy: Arbitrage"));
		
		console.log(
			chalk.yellow("Adaptive Slippage:"),
			cache.config.adaptiveSlippage === 1 ? "Enabled" : "Disabled"
		);
		
		console.log(
			chalk.yellow("Trading Enabled:"),
			cache.tradingEnabled ? "Yes" : "No"
		);

		// Create a connection to the Solana network
		const connection = new Connection(process.env.DEFAULT_RPC);
		const wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));
		console.log('wallet publicKey ::: ' + wallet.publicKey.toString());

		// Store connection and wallet for later use
		cache.connection = connection;
		cache.wallet = wallet;

		// Fetch trending tokens
		spinner = ora({
			text: "Fetching token list...",
			discardStdin: false,
		}).start();

		const trendingTokens = await fetchTrendingTokens();
		spinner.succeed("Token list fetched and saved!");

		// Use the first trending token (TRUMP) for monitoring
		const firstTrendingToken = trendingTokens[0];
		
		// Configure USDC token
		const usdcToken = getUSDCToken();

		// Configure the tokens for the bot
		spinner = ora({
			text: `Configuring token: ${firstTrendingToken.symbol}`,
			discardStdin: false,
		}).start();

		// Set up token monitoring
		const tokenA = firstTrendingToken;
		const tokenB = usdcToken;
		
		spinner.succeed(`Token configured: ${tokenA.address}`);

		// Test Jupiter API with the configured tokens
		spinner = ora({
			text: "Testing Jupiter API connection...",
			discardStdin: false,
		}).start();

		// Calculate a safe amount to use for test quote based on token decimals
		const testAmount = Math.pow(10, tokenA.decimals);

		try {
			const testQuote = await getQuote(
				tokenA.address,
				tokenB.address,
				testAmount.toString(),
				100
			);
			
			spinner.succeed("Jupiter API connection successful!");
			
			// Store the test quote for later reference
			cache.testQuote = testQuote;
			
			// Mark setup as complete
			cache.isSetupDone = true;
			
			return {
				// We'll store these in cache now instead of returning them
				jupiter: {
					// Wrapper functions for API compatibility
					async computeRoutes({ inputMint, outputMint, amount }) {
						const mintIn = inputMint.toBase58();
						const mintOut = outputMint.toBase58();
						const amountStr = amount.toString();
						
						const quote = await getQuote(mintIn, mintOut, amountStr, 100);
						
						// Format to match old Jupiter SDK format for compatibility
						return {
							routesInfos: [{
								outAmount: quote.outAmount,
								otherAmountThreshold: quote.otherAmountThreshold,
								inAmount: quote.inAmount,
								amount: quote.inAmount,
								priceImpactPct: quote.priceImpact,
								marketInfos: quote.routePlan.map(step => ({
									id: step.swapInfo?.ammKey || 'unknown',
									label: step.swapInfo?.label || 'Unknown',
									inputMint: step.sourceMint,
									outputMint: step.destinationMint,
									inAmount: step.inputAmount,
									outAmount: step.outputAmount,
									lpFee: { amount: '0' }
								}))
							}]
						};
					},
					
					// Wrapper for swap execution compatibility
					async exchange({ routeInfo }) {
						return {
							async execute() {
								// In reality, we'd set this up with a proper swap execution
								// For now, just log the intent to swap
								console.log(`Would execute swap from ${routeInfo.marketInfos[0].inputMint} to ${routeInfo.marketInfos[0].outputMint}`);
								return { txid: 'simulation-only' };
							}
						};
					},
					
					// Add function to check arbitrage opportunities
					async checkArbitrageOpportunity(tokenAMint, tokenBMint, amount) {
						return checkArbitrageOpportunity(tokenAMint, tokenBMint, amount);
					}
				},
				tokenA,
				tokenB,
			};
		} catch (error) {
			spinner.fail(`Jupiter API test failed: ${error.message}`);
			throw error;
		}
	} catch(error) {
		console.log(chalk.red("✖ Setup failed!"));
		console.error(chalk.red("Error during setup:"),error.message);
		console.error(chalk.red("Detailed error:"),error);
		console.log(chalk.yellowBright("SOLUTION: Check your .env configuration and ensure your wallet has sufficient funds"));
		logExit(1,error);
		process.exitCode = 1;
		process.exit(1);
	}
};

const getInitialotherAmountThreshold = async (
	jupiter,
	inputToken,
	outputToken,
	amountToTrade
) => {
	let spinner;
	try {
		const tokenDecimals = cache.sideBuy ? inputToken.decimals : outputToken.decimals;
		const spinnerText = `Computing routes for the token with amountToTrade ${amountToTrade} with decimals ${tokenDecimals}`;

		spinner = ora({
			text: spinnerText,
			discardStdin: false,
			color: "magenta",
		}).start();

		// Get quote using new Jupiter API
		const quote = await getQuote(
			inputToken.address,
			outputToken.address,
			amountToTrade.toString(),
			100  // 1% slippage
		);

		if (quote) {
			spinner.succeed("Routes computed using Jupiter API v6!");
			return quote.otherAmountThreshold;
		} else {
			spinner.fail("No routes found. Something is wrong! Check tokens:" + inputToken.address + " " + outputToken.address);
			console.error(chalk.red("No routes found between these tokens. This could be due to:"));
			console.error(chalk.yellow("1. Insufficient liquidity between the token pair"));
			console.error(chalk.yellow("2. Invalid token address configuration"));
			console.error(chalk.yellow("3. RPC issues or network congestion"));
			process.exit(1);
		}
	} catch(error) {
		if(spinner)
			spinner.fail(chalk.bold.redBright("Computing routes failed!\n"));
		console.error(chalk.red("Error computing routes:"),error.message);
		console.error(chalk.yellow("This could be due to RPC issues, insufficient liquidity, or invalid token configuration"));
		logExit(1,error);
		process.exitCode = 1;
		process.exit(1);
	}
};

module.exports = {
	setup,
	getInitialotherAmountThreshold,
	balanceCheck,
	checkTokenABalance,
};
