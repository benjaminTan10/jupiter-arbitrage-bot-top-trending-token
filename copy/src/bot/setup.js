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
const checkTokenABalance = async (tokenA,initialTradingBalance) => {
	try {
		// Check the balance of TokenA to make sure there is enough to trade with
		var realbalanceTokenA = await balanceCheck(tokenA);
		bal1 = toDecimal(realbalanceTokenA,tokenA.decimals);
		bal2 = toDecimal(initialTradingBalance,tokenA.decimals);

		if(realbalanceTokenA < initialTradingBalance) {
			throw new Error(`\x1b[93mThere is insufficient balance in your wallet of ${tokenA.symbol}\x1b[0m
			\nYou currently only have \x1b[93m${bal1}\x1b[0m ${tokenA.symbol}.
			\nTo run the bot you need \x1b[93m${bal2}\x1b[0m ${tokenA.symbol}.
			\nEither add more ${tokenA.symbol} to your wallet or lower the amount below ${bal1}.\n`);
		}
		return realbalanceTokenA;
	} catch(error) {
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
	let spinner;
	try {
		console.log(chalk.bold.cyan("\n========== ARBITRAGE BOT SETUP ==========\n"));

		// Load configuration from environment variables
		const config = loadConfigFromEnv();

		// Store configuration in cache
		cache.config = config;

		// Fetch Jupiter token list
		spinner = ora({
			text: "Fetching token list...",
			discardStdin: false,
		}).start();

		// Create connection to RPC
		const connection = new Connection(config.rpc[0],{
			commitment: "processed",
			confirmTransactionInitialTimeout: 60000,
		});

		// Create wallet keypair from private key
		const wallet = Keypair.fromSecretKey(
			bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY)
		);
		console.log("wallet publicKey :::",wallet.publicKey.toString());
		// Store wallet public key in cache
		cache.walletpubkey = wallet.publicKey.toString().slice(0,8) + "...";
		cache.walletpubkeyfull = wallet.publicKey.toString();

		// Check SOL balance
		// const solBalance = await connection.getBalance(wallet.publicKey);
		// if(solBalance < 0.001 * LAMPORTS_PER_SOL) {
		// 	spinner.fail("Insufficient SOL balance for transactions");
		// 	console.error(chalk.red(`Your wallet needs at least 0.01 SOL for transactions. Current balance: ${solBalance / LAMPORTS_PER_SOL} SOL`));
		// 	process.exit(1);
		// }

		// Fetch Jupiter token list
		const tokenList = await (
			await fetch("https://tokens.jup.ag/tokens?tags=birdeye-trending")
		).json();

		// Store token list in temp directory
		createTempDir();
		fs.writeFileSync("./temp/tokenlist.json",JSON.stringify(tokenList));
		spinner.succeed("Token list fetched and saved!");

		// Find required tokens in token list
		const tokenA = tokenList[0].address;
		const tokenB = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

		if(!tokenA) {
			spinner.fail(`Token with address ${config.tokenA.address} not found in Jupiter token list`);
			process.exit(1);
		}

		if(!tokenB) {
			spinner.fail("USDC token not found in Jupiter token list");
			process.exit(1);
		}

		// Store tokens in cache config
		cache.config.tokenA = tokenA;
		cache.config.tokenB = tokenB;

		spinner.succeed(`Token configured: ${tokenA}`);

		// Initialize Jupiter
		const jupiter = await Jupiter.load({
			connection,
			cluster: "mainnet-beta",
			user: wallet,
			wrapUnwrapSOL: true,
			routeCacheDuration: 10_000, // 10 seconds
		});

		// Check if wallet can connect
		try {
			spinner.text = "Connecting to wallet...";
			// Get SOL balance to check connectivity
			const balance = await connection.getBalance(wallet.publicKey);
			spinner.succeed(`Wallet connected: ${wallet.publicKey.toString().slice(0,8)}...`);
		} catch(error) {
			spinner.fail("Failed to connect to wallet");
			console.error(chalk.red("Error connecting to wallet:"),error.message);
			process.exit(1);
		}

		// Check if RPC can connect
		try {
			spinner.text = "Connecting to RPC...";
			await connection.getLatestBlockhash();
			spinner.succeed(`Connected to RPC: ${config.rpc[0].slice(0,20)}...`);
		} catch(error) {
			spinner.fail("Failed to connect to RPC");
			console.error(chalk.red("Error connecting to RPC:"),error.message);
			process.exit(1);
		}

		// Initialize Jupiter with configuration
		spinner.text = "Loading Jupiter SDK...";
		jupiter.setExcludeDexes({
			'Aldrin': true,
			'Crema': true,
			'GooseFX': false,
			'Invariant': true,
			'Lifinity': false,
			'Mercurial': false,
			'Meteora': false,
			'Raydium': false,
			'Raydium CLMM': true,
			'Saber': false,
			'Serum': false,
			'Orca': false,
			'Orca (Whirlpools)': false,
			'Stepn': false,
			'Cropper': false,
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
		});

		// Jupiter is initialized, check token balance
		try {
			spinner.text = `Checking ${tokenA.symbol} balance...`;
			const tokenBalance = await balanceCheck(tokenA);
			const uiBalance = toDecimal(tokenBalance,tokenA.decimals);

			// Check if balance is sufficient for configured trade size
			const requiredBalance = config.tradeSize.value;
			const uiRequiredBalance = toDecimal(requiredBalance * (10 ** tokenA.decimals),tokenA.decimals);

			if(parseFloat(uiBalance) < parseFloat(uiRequiredBalance)) {
				spinner.fail(`Insufficient ${tokenA.symbol} balance for configured trade size`);
				console.error(chalk.red(`Your wallet has ${uiBalance} ${tokenA.symbol}, but the configured trade size requires ${uiRequiredBalance} ${tokenA.symbol}`));
				console.error(chalk.yellow(`Please add more ${tokenA.symbol} to your wallet or reduce the TRADE_SIZE_SOL in .env`));
				process.exit(1);
			}

			spinner.succeed(`${tokenA.symbol} balance is sufficient: ${uiBalance}`);
		} catch(error) {
			spinner.fail(`Failed to check ${tokenA.symbol} balance`);
			console.error(chalk.red("Error checking token balance:"),error.message);
			process.exit(1);
		}

		cache.isSetupDone = true;
		spinner.succeed("Jupiter V4 SDK loaded successfully!");

		console.log(chalk.bold.green("\n========== SETUP COMPLETE ==========\n"));
		console.log(chalk.cyan("The bot will now start trading with the configured settings."));
		console.log(chalk.cyan("Press [CTRL]+[C] to exit, [S] to toggle trading, [H] for help.\n"));

		return {jupiter,tokenA,tokenB,wallet};
	} catch(error) {
		if(spinner) {
			spinner.fail(chalk.red("Setup failed!"));
		}
		console.error(chalk.red("Error during setup:"),error.message);
		console.error(chalk.yellow("Detailed error:"),error.stack);

		// Provide specific error guidance based on error type
		if(error.message.includes("balance")) {
			console.error(chalk.yellow("SOLUTION: Add more funds to your wallet or reduce the trade size in .env"));
		} else if(error.message.includes("RPC")) {
			console.error(chalk.yellow("SOLUTION: Check your RPC URL in .env or try a different RPC provider"));
		} else if(error.message.includes("token")) {
			console.error(chalk.yellow("SOLUTION: Verify the token address in .env or use a different token"));
		} else {
			console.error(chalk.yellow("SOLUTION: Check your .env configuration and ensure your wallet has sufficient funds"));
		}

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
	}
};

module.exports = {
	setup,
	getInitialotherAmountThreshold,
	balanceCheck,
	checkTokenABalance,
};
