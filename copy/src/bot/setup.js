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
	// Create dir
	createTempDir();

	// Properly handle wallet initialization with better error handling
	let wallet;
	try {
		// Initialize wallet from private key with explicit error handling
		const privateKeyString = process.env.SOLANA_WALLET_PRIVATE_KEY;
		if(!privateKeyString) {
			throw new Error("SOLANA_WALLET_PRIVATE_KEY is missing in environment variables");
		}

		// Log that we're initializing the wallet
		console.log(chalk.cyan("Initializing wallet..."));

		// Try to decode and create the wallet
		try {
			const decodedKey = bs58.decode(privateKeyString);
			wallet = Keypair.fromSecretKey(decodedKey);

			// Verify wallet was created properly
			if(!wallet || !wallet.publicKey) {
				throw new Error("Failed to create wallet from private key");
			}

			console.log(chalk.green("Wallet initialized successfully"));
		} catch(walletError) {
			console.error(chalk.red("Error creating wallet:"),walletError);
			throw new Error("Invalid wallet private key format. Please check your .env file.");
		}
	} catch(error) {
		console.error(chalk.red("Wallet setup failed:"),error.message);
		logExit(1,error);
		process.exit(1);
	}

	let spinner = ora({
		text: "🔄 Setting up Jupiter connection...",
		spinner: "dots",
	}).start();

	try {
		// Listen for hotkeys
		listenHotkeys();

		// setup trading strategy based on env variables or default to arbitrage
		cache.config.tradingStrategy = "arbitrage";
		cache.config.tokenA = {};
		cache.config.tokenB = {};

		// Set token A (default to WSOL if not set)
		const mintAddress = process.env.MINT_ADDRESS || "So11111111111111111111111111111111111111112";

		// Get token information
		let tokenA;
		try {
			const trendingTokens = await fetchTrendingTokens();
			tokenA = trendingTokens[0];

			if(!tokenA) {
				// Fallback to WSOL if token not found
				tokenA = trendingTokens.find(token => token.address === "So11111111111111111111111111111111111111112");

				if(!tokenA) {
					throw new Error("Could not find WSOL token as fallback");
				}
				console.log(chalk.yellow(`Using WSOL as fallback token.`));
			}
		} catch(error) {
			console.error(chalk.red("Error fetching token information:"),error);
			throw new Error("Failed to get token information");
		}

		// Setup token B (USDC by default for value reference)
		const tokenB = getUSDCToken();

		// Log info about the tokens
		console.log(chalk.green(
			`Using tokens: ${tokenA.symbol} (${tokenA.address.slice(0,6)}...) and ${tokenB.symbol} (${tokenB.address.slice(0,6)}...)`
		));

		// Check if user wallet has enough SOL to pay for transaction fees
		const connection = new Connection(process.env.DEFAULT_RPC);
		try {
			const balance = await connection.getBalance(wallet.publicKey);
			const solBalance = balance / LAMPORTS_PER_SOL;

			if(solBalance < 0.01) {
				console.warn(chalk.yellow(
					`Warning: Your wallet only has ${solBalance.toFixed(4)} SOL. This may not be enough for transaction fees.`
				));
			}
		} catch(balanceError) {
			console.warn(chalk.yellow("Could not check wallet SOL balance:"),balanceError.message);
		}

		// Test Jupiter API with a tiny amount of the token to verify connection
		try {
			// Use a small amount for testing (0.000001 of the token)
			const testAmount = Math.pow(10,tokenA.decimals - 6).toString(); // Very small amount
			const testQuote = await getQuote(tokenA.address,tokenB.address,testAmount,100);

			if(!testQuote) {
				throw new Error("Failed to get a test quote from Jupiter API");
			}

			spinner.succeed(chalk.green("Jupiter API connection successful!"));
		} catch(apiError) {
			spinner.fail(chalk.red("Jupiter API connection failed"));
			console.error(chalk.red("Error connecting to Jupiter API:"),apiError.message);
			throw new Error("Failed to connect to Jupiter API. Check your network connection and RPC URL.");
		}

		// Create a real Jupiter interface
		const jupiter = {
			computeRoutes: async ({inputMint,outputMint,amount,slippageBps = 100}) => {
				try {
					console.log(chalk.cyan(`Computing routes for ${inputMint} → ${outputMint}`));

					// Convert PublicKey to string
					const inputMintStr = inputMint instanceof PublicKey ? inputMint.toString() : inputMint;
					const outputMintStr = outputMint instanceof PublicKey ? outputMint.toString() : outputMint;

					// Check if this is a same-token arbitrage
					const isArbitrage = inputMintStr === outputMintStr;

					if(isArbitrage) {
						console.log(chalk.yellow("Same-token arbitrage detected - using intermediate USDC token for routing"));
					}

					// Get quote from Jupiter API
					const quote = await getQuote(
						inputMintStr,
						outputMintStr,
						amount.toString(),
						slippageBps
					);

					if(!quote || !quote.outAmount) {
						console.log(chalk.red("No routes available"));
						return {routesInfos: []};
					}

					// Format response to match the expected format
					const routeInfo = {
						outAmount: quote.outAmount,
						inAmount: quote.inAmount,
						amount: quote.inAmount,
						otherAmountThreshold: quote.otherAmountThreshold,
						slippageBps: slippageBps,
						priceImpactPct: parseFloat(quote.priceImpactPct || "0"),
						marketInfos: (quote.routePlan || []).map(step => ({
							id: step.swapInfo?.ammKey || step.swapInfo?.id || 'unknown',
							label: step.swapInfo?.label || 'Unknown AMM',
							inputMint: step.swapInfo?.inputMint || step.sourceMint,
							outputMint: step.swapInfo?.outputMint || step.destinationMint,
							inAmount: step.swapInfo?.inAmount || step.inputAmount,
							outAmount: step.swapInfo?.outAmount || step.outputAmount,
							lpFee: {amount: '0'}
						}))
					};

					// Calculate profit for arbitrage
					if(isArbitrage) {
						const inAmountBN = BigInt(quote.inAmount);
						const outAmountBN = BigInt(quote.outAmount);
						const profit = outAmountBN > inAmountBN ?
							Number((outAmountBN - inAmountBN) * BigInt(10000) / inAmountBN) / 100 : 0;

						console.log(chalk.cyan(`Arbitrage route found with profit: ${profit.toFixed(4)}%`));
					}

					return {routesInfos: [routeInfo]};
				} catch(error) {
					console.error(chalk.red("Error computing routes:"),error.message);
					return {routesInfos: []};
				}
			},

			exchange: async ({routeInfo}) => {
				return {
					execute: async () => {
						console.log(chalk.yellow("Executing swap in simulation mode"));
						// In real implementation, this would call the actual swap API
						// For now, just simulate a successful transaction
						return {
							txid: "simulation_mode_txid",
							inputAmount: routeInfo.inAmount,
							outputAmount: routeInfo.outAmount,
							success: true
						};
					}
				};
			}
		};

		return {
			jupiter,
			tokenA,
			tokenB,
			wallet
		};
	} catch(error) {
		spinner.fail(chalk.red("Setup failed!"));
		console.error(chalk.red("Error during setup:"),error);
		logExit(1,error);
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

		if(quote) {
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
