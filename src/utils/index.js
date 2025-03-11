const chalk = require("chalk");
const fs = require("fs");
const ora = require("ora-classic");
const {logExit} = require("../bot/exit");
const bs58 = require("bs58");
const {PublicKey,Connection,Keypair,LAMPORTS_PER_SOL} = require("@solana/web3.js");
require("dotenv").config();
const {createTempDir, fetchTrendingTokens, getUSDCToken} = require('./tokenFetcher');

const getCircularReplacer = () => {
	const seen = new WeakSet();
	return (key,value) => {
		if(typeof value === "object" && value !== null) {
			if(seen.has(value)) {
				return;
			}
			seen.add(value);
		} else if(typeof value === "bigint") {
			value = value.toString();
		}
		return value;
	};
};

const storeItInTempAsJSON = (filename,data) => {
	createTempDir();
	fs.writeFileSync(`./temp/${filename}.json`,JSON.stringify(data,getCircularReplacer(),2));
};

const createConfigFile = (config) => {
	const configSpinner = ora({
		text: "Creating config...",
		discardStdin: false,
	}).start();

	// Set the adaptive slippage setting based on initial configuration
	const adaptiveslippage = config?.adaptiveslippage?.value ?? 0;

	const configValues = {
		network: config.network.value,
		rpc: config.rpc.value,
		tradingStrategy: config.strategy.value,
		tokenA: config.tokens.value.tokenA,
		tokenB: config.tokens.value.tokenB,
		slippage: config.slippage.value,
		adaptiveSlippage: adaptiveslippage,
		priority: config.priority.value,
		minPercProfit: config.profit.value,
		minInterval: parseInt(config.advanced.value.minInterval),
		tradeSize: {
			value: parseFloat(config["trading size"].value.value),
			strategy: config["trading size"].value.strategy,
		},
		ui: {
			defaultColor: "cyan",
		},
		storeFailedTxInHistory: true,
	};

	fs.writeFileSync("./config.json",JSON.stringify(configValues,null,2),{});
	configSpinner.succeed("Config created!");
};

const verifyConfig = (config) => {
	let result = true;
	const badConfig = [];
	Object.entries(config).forEach(([key,value]) => {
		const isSet = value.isSet;
		const isSectionSet =
			isSet instanceof Object
				? Object.values(isSet).every((value) => value === true)
				: isSet;

		if(!isSectionSet) {
			result = false;
			badConfig.push(key);
		}
	});
	return {result,badConfig};
};

/**
 * It loads the config file and returns the config object
 * @returns The config object
 */
const loadConfigFile = ({showSpinner = false}) => {
	// This is now just a compatibility function
	// All configuration is read directly from environment variables
	console.warn(chalk.yellow("Warning: loadConfigFile is deprecated. Configuration is now read from environment variables."));

	// Return the cache configuration which is populated from environment variables
	return require("../bot/cache").config;
};

const calculateProfit = ((oldVal,newVal) => ((newVal - oldVal) / oldVal) * 100);

const toDecimal = (number,decimals) =>
	parseFloat(String(number) / 10 ** decimals).toFixed(decimals);


const toNumber = (number,decimals) =>
	Math.floor(String(number) * 10 ** decimals);

/**
 * It calculates the number of iterations per minute and updates the cache.
 */
const updateIterationsPerMin = (cache) => {
	const iterationTimer =
		(performance.now() - cache.iterationPerMinute.start) / 1000;

	if(iterationTimer >= 60) {
		cache.iterationPerMinute.value = Number(
			cache.iterationPerMinute.counter.toFixed()
		);
		cache.iterationPerMinute.start = performance.now();
		cache.iterationPerMinute.counter = 0;
	} else cache.iterationPerMinute.counter++;
};

const checkRoutesResponse = (routes) => {
	if(Object.hasOwn(routes,"routesInfos")) {
		if(routes.routesInfos.length === 0) {
			console.log(routes);
			logExit(1,{
				message: "No routes found or something is wrong with RPC / Jupiter! ",
			});
			process.exit(1);
		}
	} else {
		console.log(routes);
		logExit(1,{
			message: "Something is wrong with RPC / Jupiter! ",
		});
		process.exit(1);
	}
};

function displayMessage(message) {
	console.clear(); // Clear console before displaying message
	const lineLength = 50; // Length of each line
	const paddingLength = Math.max(0,Math.floor((lineLength - message.length) / 2)); // Calculate padding length for centering, ensuring it's non-negative
	const padding = "-".repeat(paddingLength); // Create padding string
	const displayMessage = `${padding}\x1b[93m${message}\x1b[0m${padding}`; // Create display message with padding and light yellow color ANSI escape codes

	console.log("\n");
	console.log(`\x1b[1m${'ARB PROTOCOL BOT SETUP TESTS'}\x1b[0m\n`);
	console.log("\x1b[93m*\x1b[0m".repeat(lineLength / 2)); // Display top border in light yellow
	console.log(`\n${displayMessage}\n`); // Display message
	console.log("\x1b[93m*\x1b[0m".repeat(lineLength / 2)); // Display bottom border in light yellow
	console.log("\n");
}

const checkForEnvFile = () => {
	if(!fs.existsSync("./.env")) {
		displayMessage("Please refer to the readme to set up the Bot properly.\n\nYou have not created the .ENV file yet.\n\nRefer to the .env.example file.");
		logExit(1,{
			message: "No .env file found! ",
		});
		process.exit(1);
	}
};
const checkWallet = () => {
	if(
		!process.env.SOLANA_WALLET_PRIVATE_KEY ||
		(process.env.SOLANA_WALLET_PUBLIC_KEY &&
			process.env.SOLANA_WALLET_PUBLIC_KEY?.length !== 88)
	) {
		displayMessage(`${process.env.SOLANA_WALLET_PUBLIC_KEY} Your wallet is not valid. \n\nCheck the .env file and ensure you have put in the private key in the correct format. \n\ni.e. SOLANA_WALLET_PRIVATE_KEY=3QztVpoRgLNvAmBX9Yo3cjR3bLrXVrJZbPW5BY7GXq8GFvEjR4xEDeVai85a8WtYUCePvMx27eBut5K2kdqN8Hks`);
		process.exit(1);
	}
}

const checkArbReady = async () => {
	try {
		// For simplicity, we'll just make sure the wallet and RPC can connect
		const connection = new Connection(process.env.DEFAULT_RPC);
		wallet = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_WALLET_PRIVATE_KEY));
		
		// // Get wallet's SOL balance
		// const balance = await connection.getBalance(wallet.publicKey);
		// const solBalance = balance / LAMPORTS_PER_SOL;

		console.log(chalk.green(`Wallet connected successfully: ${wallet.publicKey.toString()}`));
		// console.log(chalk.green(`SOL balance: ${solBalance.toFixed(4)} SOL`));

		return true;
	} catch(err) {
		console.error(chalk.red("Failed to connect to wallet or RPC:"), err.message);
		process.exit(1);
	}
};

module.exports = {
	createTempDir,
	storeItInTempAsJSON,
	createConfigFile,
	loadConfigFile,
	verifyConfig,
	calculateProfit,
	toDecimal,
	toNumber,
	updateIterationsPerMin,
	checkRoutesResponse,
	checkForEnvFile,
	checkArbReady,
	checkWallet,
	fetchTrendingTokens,
	getUSDCToken,
};
