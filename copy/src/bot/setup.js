const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");
const bs58 = require("bs58");
const {Jupiter} = require("@jup-ag/core");
const {Connection,Keypair,PublicKey,LAMPORTS_PER_SOL} = require("@solana/web3.js");

var JSBI = (require('jsbi'));
var invariant = (require('tiny-invariant'));
var _Decimal = (require('decimal.js'));
var _Big = (require('big.js'));
var toFormat = (require('toformat'));
var anchor = require('@project-serum/anchor');

const {logExit} = require("./exit");
const {toDecimal,createTempDir} = require("../utils");
const {intro,listenHotkeys} = require("./ui");
const {setTimeout} = require("timers/promises");
const cache = require("./cache");
const {fetchTrendingTokens,getUSDCToken} = require("../utils/tokenFetcher");
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

// Load configuration directly from environment variables
const loadConfigFromEnv = () => {
	console.log(chalk.cyan("Loading configuration from environment variables..."));

	// Parse the token address from environment variables
	const tokenAddress = process.env.MINT_ADDRESS || 'So11111111111111111111111111111111111111112';

	// Get RPC configuration
	const defaultRpc = process.env.DEFAULT_RPC;
	const altRpcList = process.env.ALT_RPC_LIST ? process.env.ALT_RPC_LIST.split(',').filter(Boolean) : [];
	const rpcList = [defaultRpc,...altRpcList].filter(Boolean);

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
		tokenA: {address: tokenAddress}, // Will be populated with full token data later
		slippage: slippage,
		adaptiveSlippage: adaptiveSlippage,
		priority: priority,
		minPercProfit: minPercProfit,
		minInterval: minInterval,
		tradeSize: {
			value: tradeSize,
			strategy: tradeSizeStrategy,
		},
		tradingEnabled: tradingEnabled,
		ui: {
			defaultColor: process.env.UI_COLOR || "cyan",
		},
		storeFailedTxInHistory: true,
	};

	console.log(chalk.green("Configuration loaded successfully:"));
	console.log(chalk.yellow("Network:"),config.network);
	console.log(chalk.yellow("RPC:"),config.rpc[0].slice(0,50) + (config.rpc[0].length > 50 ? '...' : ''));
	console.log(chalk.yellow("Token:"),config.tokenA.address);
	console.log(chalk.yellow("Trade Size:"),config.tradeSize.value,`(${config.tradeSize.strategy})`);
	console.log(chalk.yellow("Min Profit:"),config.minPercProfit + "%");
	console.log(chalk.yellow("Slippage:"),config.slippage / 100 + "%");
	console.log(chalk.yellow("Adaptive Slippage:"),config.adaptiveSlippage ? "Enabled" : "Disabled");
	console.log(chalk.yellow("Trading Enabled:"),config.tradingEnabled ? "Yes" : "No");

	return config;
};

const setup = async () => {
	try {
		// intro screen
		process.env.SKIP_INTRO !== "true" && (await intro());

		// hotkeys
		listenHotkeys();

		// create temp dir
		createTempDir();

		// load config
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

		// Set up Jupiter
		const jupiter = await Jupiter.load({
			connection,
			cluster: 'mainnet-beta',
			user: wallet,
			restrictIntermediateTokens: false,
			wrapUnwrapSOL: cache.wrapUnwrapSOL,
		});

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

		// Mark setup as complete
		cache.isSetupDone = true;

		return {
			jupiter,
			tokenA,
			tokenB,
		};
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

		if(routes?.routesInfos?.length > 0) spinner.succeed("Routes computed!");
		else {
			spinner.fail("No routes found. Something is wrong! Check tokens:" + inputToken.address + " " + outputToken.address);
			console.error(chalk.red("No routes found between these tokens. This could be due to:"));
			console.error(chalk.yellow("1. Insufficient liquidity between the token pair"));
			console.error(chalk.yellow("2. Invalid token address configuration"));
			console.error(chalk.yellow("3. RPC issues or network congestion"));
			process.exit(1);
		}

		return routes.routesInfos[0].otherAmountThreshold;
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
