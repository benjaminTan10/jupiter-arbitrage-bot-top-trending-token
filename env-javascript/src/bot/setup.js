const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");
const bs58 = require("bs58");
const { Jupiter } = require("@jup-ag/core");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

var JSBI = (require('jsbi'));
var invariant = (require('tiny-invariant'));
var _Decimal = (require('decimal.js'));
var _Big = (require('big.js'));
var toFormat = (require('toformat'));
var anchor = require('@project-serum/anchor');

const { logExit } = require("./exit");
const { loadConfigFile, toDecimal, createTempDir } = require("../utils");
const { intro, listenHotkeys } = require("./ui");
const { setTimeout } = require("timers/promises");
const cache = require("./cache");
const wrapUnwrapSOL = cache.wrapUnwrapSOL;
const { loadConfigFromEnv } = require("../utils/envConfig");
const path = require("path");

// Account balance code
const balanceCheck = async (checkToken) => {
	let checkBalance = Number(0);
	let t = Number(0);

	const connection = new Connection(process.env.DEFAULT_RPC);
	wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));

	if (wrapUnwrapSOL && checkToken.address === 'So11111111111111111111111111111111111111112') {
		// This is where Native balance is needing to be checked and not the Wrapped SOL ATA
		try {
			const balance = await connection.getBalance(wallet.publicKey);
			checkBalance = Number(balance);
		} catch (error) {
			console.error('Error fetching native SOL balance:', error);
		}
	} else {
		// Normal token so look up the ATA balance(s)
		try {
			let totalTokenBalance = BigInt(0);
			const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
				mint: new PublicKey(checkToken.address)
			});
		
			tokenAccounts.value.forEach((accountInfo) => {
				const parsedInfo = accountInfo.account.data.parsed.info;
				totalTokenBalance += BigInt(parsedInfo.tokenAmount.amount);
			});
		
			// Convert totalTokenBalance to a regular number
			checkBalance = Number(totalTokenBalance);
	
		} catch (error) {
			console.error('Error fetching token balance:', error);
		}
	}

	try {
		// Pass back the BN version to match
		let checkBalanceUi = toDecimal(checkBalance,checkToken.decimals);
		console.log(`Wallet balance for ${checkToken.symbol} is ${checkBalanceUi} (${checkBalance})`);
	} catch (error) {
		console.error('Silence is golden.. Or not...:', error);
	}

	if (checkBalance>Number(0)){
			return checkBalance;
	} else {
			return(Number(0));
	}
};

// Handle Balance Errors Messaging
const checkTokenABalance = async (tokenA, initialTradingBalance) => {
	try {
		// Check the balance of TokenA to make sure there is enough to trade with
		var realbalanceTokenA = await balanceCheck(tokenA);
		bal1 = toDecimal(realbalanceTokenA,tokenA.decimals);
		bal2 = toDecimal(initialTradingBalance,tokenA.decimals);

		if (realbalanceTokenA < initialTradingBalance) {
			throw new Error(`\x1b[93mThere is insufficient balance in your wallet of ${tokenA.symbol}\x1b[0m
			\nYou currently only have \x1b[93m${bal1}\x1b[0m ${tokenA.symbol}.
			\nTo run the bot you need \x1b[93m${bal2}\x1b[0m ${tokenA.symbol}.
			\nEither add more ${tokenA.symbol} to your wallet or lower the amount below ${bal1}.\n`);
		}
		return realbalanceTokenA;
	} catch (error) {
		// Handle errors gracefully
		console.error(`\n====================\n\n${error.message}\n====================\n`);
		// Return an appropriate error code or rethrow the error if necessary
		process.exit(1); // Exiting with a non-zero code to indicate failure
	}
}

const setup = async () => {
	let spinner, tokens, tokenA, tokenB, wallet;
	try {
		// listen for hotkeys
		listenHotkeys();
		await intro();

		// Initialize temp directories and files
		console.log('Ensuring temp directories and token files exist...');
		createTempDir();

		// load config file or from environment, store it in cache
		if (process.env.USE_ENV_CONFIG === "true") {
			cache.config = loadConfigFromEnv();
		} else {
			cache.config = loadConfigFile({ showSpinner: false });
		}

		spinner = ora({
			text: "Loading tokens",
			color: cache.config?.ui?.defaultColor || "cyan",
		}).start();

		// Load tokens file - with better error handling
		try {
			const tokensPath = path.join(process.cwd(), 'temp', 'tokens.json');
			
			if (!fs.existsSync(tokensPath)) {
				spinner.warn('tokens.json not found, attempting to create from default token list');
				
				// Fetch from Jupiter API or use hardcoded defaults
				const defaultTokens = {
					"tokens": [
						{
							"address": "So11111111111111111111111111111111111111112",
							"chainId": 101,
							"decimals": 9,
							"name": "Wrapped SOL",
							"symbol": "SOL",
							"logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
						},
						{
							"address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
							"chainId": 101,
							"decimals": 6,
							"name": "USD Coin",
							"symbol": "USDC",
							"logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
						}
					]
				};
				
				// Write the default tokens
				fs.writeFileSync(tokensPath, JSON.stringify(defaultTokens, null, 2));
				console.log(`Created default tokens.json at ${tokensPath}`);
			}
			
			console.log(`Reading tokens from ${tokensPath}`);
			tokens = JSON.parse(fs.readFileSync(tokensPath));
			
			// Log token details
			console.log(`Loaded ${tokens.tokens?.length || 0} tokens from file`);
			if (!tokens.tokens || tokens.tokens.length === 0) {
				throw new Error('No tokens found in tokens.json');
			}
		} catch (error) {
			spinner.fail(`Loading tokens failed: ${error.message}`);
			console.error('Token loading error details:', error);
			
			// Try to continue with config tokens directly
			spinner.text = "Attempting to use tokens from config.json instead...";
			
			if (cache.config.tokenA && cache.config.tokenB) {
				tokens = {
					tokens: [
						cache.config.tokenA,
						cache.config.tokenB
					]
				};
				spinner.succeed("Using tokens from config.json");
			} else {
				spinner.fail("Setting up failed!");
				console.log(chalk.red(`
				Loading tokens failed!
				Please run the Wizard to generate it using \`yarn wizard\`
				`));
				throw error;
			}
		}

		try {
			spinner.text = "Checking wallet...";
			if (
				!process.env.SOLANA_WALLET_PRIVATE_KEY ||
				(process.env.SOLANA_WALLET_PUBLIC_KEY &&
					process.env.SOLANA_WALLET_PUBLIC_KEY?.length !== 88)
			) {
				throw new Error("Wallet check failed!");
			} else {
				wallet = Keypair.fromSecretKey(
					bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY)
				);
			}
		} catch (error) {
			spinner.text = chalk.black.bgRedBright(
				`\n	Wallet check failed! \n	Please make sure that ${chalk.bold(
					"SOLANA_WALLET_PRIVATE_KEY "
				)}\n	inside ${chalk.bold(".env")} file is correct \n`
			);
			logExit(1, error);
			process.exitCode = 1;
			throw error;
		}

		// Set up the RPC connection
		const connection = new Connection(cache.config.rpc[0]);

		spinner.text = "Loading the Jupiter V4 SDK and getting ready to trade...";
		let jupiter;
		try {
			// Set safer default options for Jupiter
			const jupiterOptions = {
				connection: connection,
				cluster: "mainnet-beta",
				user: wallet,
				// Only enable specific AMMs to avoid the Raydium CLMM error
				ammsToExclude: ["Raydium CLMM"], // Exclude Raydium CLMM which is causing the error
				wrapUnwrapSOL: cache.config.wrapUnwrapSOL ?? true,
				slidingTaxmanEnabled: true
			};

			console.log("Initializing Jupiter with options:", JSON.stringify(jupiterOptions, null, 2));
			jupiter = await Jupiter.load(jupiterOptions);
			spinner.succeed("Jupiter SDK loaded successfully!");
		} catch (error) {
			spinner.fail(`Failed to initialize Jupiter: ${error.message}`);
			console.error("Jupiter initialization error details:", error);
			
			// Try again with even more conservative settings
			spinner.text = "Retrying Jupiter initialization with fallback settings...";
			try {
				const fallbackOptions = {
					connection: connection,
					cluster: "mainnet-beta",
					user: wallet,
					// Exclude all problematic AMMs
					ammsToExclude: ["Raydium CLMM", "Orca (Whirlpools)", "Meteora", "GooseFX"],
					wrapUnwrapSOL: cache.config.wrapUnwrapSOL ?? true,
					// Set retry options
					retryRequestOptions: { 
						maxRetries: 3,
						retryBackoffType: 'exponential',
						retryDelay: 1000
					}
				};
				
				console.log("Trying fallback Jupiter options:", JSON.stringify(fallbackOptions, null, 2));
				jupiter = await Jupiter.load(fallbackOptions);
				spinner.succeed("Jupiter SDK loaded with fallback settings!");
			} catch (retryError) {
				spinner.fail("Jupiter initialization failed completely!");
				console.error("Jupiter retry error:", retryError);
				throw new Error(`Failed to initialize Jupiter: ${error.message}. Retry failed: ${retryError.message}`);
			}
		}
		cache.isSetupDone = true;
		spinner.succeed("Checking to ensure you are ARB ready...\n====================\n");
		return { jupiter, tokenA, tokenB, wallet };
	} catch (error) {
		if (spinner)
			spinner.fail(
				chalk.bold.redBright(`Setting up failed!\n 	${spinner.text}`)
			);
		logExit(1, error);
		process.exitCode = 1;
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

		//JSBI AMT to TRADE
		const amountInJSBI = JSBI.BigInt(amountToTrade);

		// compute routes for the first time
		const routes = await jupiter.computeRoutes({
			inputMint: new PublicKey(inputToken.address),
			outputMint: new PublicKey(outputToken.address),
			amount: amountInJSBI,
			slippageBps: 0,
			forceFetch: true,
			onlyDirectRoutes: false,
			filterTopNResult: 1,
		});

		if (routes?.routesInfos?.length > 0) spinner.succeed("Routes computed!");
		else spinner.fail("No routes found. Something is wrong! Check tokens:"+inputToken.address+" "+outputToken.address);

		return routes.routesInfos[0].otherAmountThreshold;
	} catch (error) {
		if (spinner)
			spinner.fail(chalk.bold.redBright("Computing routes failed!\n"));
		logExit(1, error);
		process.exitCode = 1;
	}
};

module.exports = {
	setup,
	getInitialotherAmountThreshold,
	balanceCheck,
	checkTokenABalance,
};
