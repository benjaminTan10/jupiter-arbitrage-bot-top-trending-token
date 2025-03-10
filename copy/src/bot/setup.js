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
const { toDecimal, createTempDir } = require("../utils");
const { intro, listenHotkeys } = require("./ui");
const { setTimeout } = require("timers/promises");
const cache = require("./cache");
const wrapUnwrapSOL = cache.wrapUnwrapSOL;

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

// Load configuration directly from environment variables
const loadConfigFromEnv = () => {
	console.log(chalk.cyan("Loading configuration from environment variables..."));
	
	// Parse the token address from environment variables
	const tokenAddress = process.env.MINT_ADDRESS || 'So11111111111111111111111111111111111111112';
	
	// Get RPC configuration
	const defaultRpc = process.env.DEFAULT_RPC;
	const altRpcList = process.env.ALT_RPC_LIST ? process.env.ALT_RPC_LIST.split(',').filter(Boolean) : [];
	const rpcList = [defaultRpc, ...altRpcList].filter(Boolean);
	
	// Parse other settings
	const tradingEnabled = process.env.TRADING_ENABLED === "true";
	const tradeSize = parseFloat(process.env.TRADE_SIZE_SOL) || 1.0;
	const tradeSizeStrategy = process.env.TRADE_SIZE_STRATEGY || "fixed";
	const minPercProfit = parseFloat(process.env.MIN_PROFIT_THRESHOLD) || 0.5;
	const slippage = parseInt(process.env.MAX_SLIPPAGE_PERCENT * 100) || 100; // Convert percent to BPS
	const priority = parseInt(process.env.PRIORITY) || 100;
	const minInterval = parseInt(process.env.MIN_INTERVAL_MS) || 100;
	const adaptiveSlippage = process.env.ADAPTIVE_SLIPPAGE === "true" ? 1 : 0;
	
	const config = {
		network: "mainnet-beta",
		rpc: rpcList,
		tradingStrategy: "arbitrage", // Force arbitrage strategy
		tokenA: { address: tokenAddress }, // Will be populated with full token data later
		slippage: slippage,
		adaptiveSlippage: adaptiveSlippage,
		priority: priority,
		minPercProfit: minPercProfit,
		minInterval: minInterval,
		tradeSize: {
			value: tradeSize,
			strategy: tradeSizeStrategy,
		},
		ui: {
			defaultColor: process.env.UI_COLOR || "cyan",
		},
		storeFailedTxInHistory: true,
	};
	
	console.log(chalk.green("Configuration loaded successfully:"));
	console.log(chalk.yellow("Network:"), chalk.white(config.network));
	console.log(chalk.yellow("RPC:"), chalk.white(config.rpc[0], config.rpc.length > 1 ? `(+${config.rpc.length - 1} more)` : ''));
	console.log(chalk.yellow("Token:"), chalk.white(tokenAddress));
	console.log(chalk.yellow("Trade Size:"), chalk.white(`${tradeSize} (${tradeSizeStrategy})`));
	console.log(chalk.yellow("Min Profit:"), chalk.white(`${minPercProfit}%`));
	console.log(chalk.yellow("Slippage:"), chalk.white(`${slippage/100}%`));
	console.log(chalk.yellow("Adaptive Slippage:"), chalk.white(adaptiveSlippage ? "Enabled" : "Disabled"));
	console.log(chalk.yellow("Trading Enabled:"), chalk.white(tradingEnabled ? "Yes" : "No"));
	
	return config;
};

const setup = async () => {
	let spinner, tokens, tokenA, tokenB, wallet;
	try {
		// Create temp directory if it doesn't exist
		createTempDir();
		
		// Listen for hotkeys
		listenHotkeys();
		
		console.log(chalk.bold.cyan("\n========== ARBITRAGE BOT SETUP ==========\n"));
		
		// Load configuration from environment variables
		cache.config = loadConfigFromEnv();
		
		spinner = ora({
			text: "Setting up the bot...",
			discardStdin: false,
			color: "magenta",
		}).start();
		
		// Load tokens data
		try {
			// Check if tokens file exists
			if (!fs.existsSync("./temp/tokens.json")) {
				spinner.text = "Fetching token list...";
				
				// Fetch tokens list from Jupiter
				const response = await fetch("https://token.jup.ag/all");
				tokens = await response.json();
				
				// Save tokens list to file
				fs.writeFileSync("./temp/tokens.json", JSON.stringify(tokens));
				
				spinner.succeed("Token list fetched and saved!");
				spinner = ora({
					text: "Processing tokens...",
					discardStdin: false,
					color: "magenta",
				}).start();
			} else {
				tokens = JSON.parse(fs.readFileSync("./temp/tokens.json"));
				spinner.text = "Token list loaded from cache";
			}
			
			// Get the token data from the tokens list
			tokenA = tokens.find((t) => t.address === cache.config.tokenA.address);
			
			// If token not found, use WSOL as default
			if (!tokenA) {
				tokenA = tokens.find((t) => t.address === 'So11111111111111111111111111111111111111112');
				cache.config.tokenA.address = tokenA.address;
			}
			
			// Store full token data in config
			cache.config.tokenA = tokenA;
			
			// For arbitrage, tokenB is same as tokenA
			tokenB = tokenA;
			
			spinner.succeed(`Token configured: ${tokenA.symbol} (${tokenA.address.slice(0, 8)}...)`);
		} catch (error) {
			spinner.fail("Failed to load token data");
			console.error(error);
			process.exit(1);
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
			spinner.succeed(`Wallet connected: ${wallet.publicKey.toString().slice(0, 8)}...`);
		} catch (error) {
			spinner.fail(chalk.red("Wallet check failed!"));
			console.error(chalk.red(`Please make sure that SOLANA_WALLET_PRIVATE_KEY inside .env file is correct`));
			process.exit(1);
		}

		// Set up the RPC connection
		spinner.text = "Connecting to RPC...";
		const connection = new Connection(cache.config.rpc[0]);
		spinner.succeed(`Connected to RPC: ${cache.config.rpc[0].slice(0, 20)}...`);

		spinner.text = "Loading the Jupiter V4 SDK and getting ready to trade...";

		const jupiter = await Jupiter.load({
			connection,
			cluster: cache.config.network,
			user: wallet,
			restrictIntermediateTokens: false,
			shouldLoadSerumOpenOrders: false,
			wrapUnwrapSOL: cache.wrapUnwrapSOL,
			ammsToExclude: {
                'Aldrin': false,
                'Crema': false,
                'Cropper': true,
                'Cykura': true,
                'DeltaFi': false,
                'GooseFX': true,
                'Invariant': false,
                'Lifinity': false,
                'Lifinity V2': false,
                'Marinade': false,
                'Mercurial': false,
                'Meteora': false,
                'Raydium': false,
                'Raydium CLMM': false,
                'Saber': false,
                'Serum': true,
                'Orca': false,
                'Step': false, 
                'Penguin': false,
                'Saros': false,
                'Stepn': true,
                'Orca (Whirlpools)': false,   
                'Sencha': false,
                'Saber (Decimals)': false,
                'Dradex': true,
                'Balansol': true,
                'Openbook': false,
                'Marco Polo': false,
                'Oasis': false,
                'BonkSwap': false,
                'Phoenix': false,
                'Symmetry': true,
                'Unknown': true			
			}
		});
		cache.isSetupDone = true;
		spinner.succeed("Jupiter V4 SDK loaded successfully!");
		
		console.log(chalk.bold.green("\n========== SETUP COMPLETE ==========\n"));
		console.log(chalk.cyan("The bot will now start trading with the configured settings."));
		console.log(chalk.cyan("Press [CTRL]+[C] to exit, [S] to toggle trading, [H] for help.\n"));
		
		return { jupiter, tokenA, tokenB, wallet };
	} catch (error) {
		if (spinner) {
			spinner.fail(chalk.red("Setup failed!"));
		}
		console.error(chalk.red("Error during setup:"), error.message);
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
