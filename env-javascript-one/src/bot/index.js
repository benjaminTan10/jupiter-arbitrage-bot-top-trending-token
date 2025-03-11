console.clear();

require("dotenv").config();
const { clearInterval } = require("timers");
const { PublicKey } = require("@solana/web3.js");
const JSBI = require('jsbi');
const { setTimeout } = require("timers/promises");
const {
	calculateProfit,
	toDecimal,
	toNumber,
	updateIterationsPerMin,
	checkRoutesResponse,
	checkArbReady,
} = require("../utils");
const { handleExit, logExit } = require("./exit");
const cache = require("./cache");
const { setup, getInitialotherAmountThreshold, checkTokenABalance } = require("./setup");
const { printToConsole } = require("./ui/");
const { swap, failedSwapHandler, successSwapHandler } = require("./swap");
const { scanForArbitrageOpportunities } = require('../services/arbitrageScanner');
const fs = require("fs");
const path = require("path");
const chalk = require('chalk');
const { startLiveTokenMonitor } = require('../services/liveTokenMonitor');

const waitabit = async (ms) => {
	const mySecondPromise = new Promise(function(resolve,reject){
		console.log('construct a promise...')
		setTimeout(() => {
			reject(console.log('Error in promise'));
		},ms)
	})
}

function getRandomAmt(runtime) {
	const min = Math.ceil((runtime*10000)*0.99);
	const max = Math.floor((runtime*10000)*1.01);
	return ((Math.floor(Math.random() * (max - min + 1)) + min)/10000);
}

const pingpongStrategy = async (jupiter, tokenA, tokenB) => {
	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;

	try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		const amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance[cache.sideBuy ? "tokenA" : "tokenB"]
				: cache.initialBalance[cache.sideBuy ? "tokenA" : "tokenB"];

		const baseAmount = cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"];
		const slippage = typeof cache.config.slippage === "number" ? cache.config.slippage : 1; // 1BPS is 0.01%

		// set input / output token
		const inputToken = cache.sideBuy ? tokenA : tokenB;
		const outputToken = cache.sideBuy ? tokenB : tokenA;
		const tokdecimals = cache.sideBuy ? inputToken.decimals : outputToken.decimals;
		const amountInBN = new BN(amountToTrade);

		// check current routes via JUP4 SDK
		const performanceOfRouteCompStart = performance.now();
		const routes = await jupiter.computeRoutes({
			inputMint: new PublicKey(inputToken.address),
			outputMint: new PublicKey(outputToken.address),
			amount: amountInJSBI,
			slippageBps: slippage,
			forceFetch: true,
			onlyDirectRoutes: false,
			filterTopNResult: 2,
		});

		checkRoutesResponse(routes);

		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.routesInfos.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp = performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = await routes.routesInfos[0];

		// calculate profitability
		const simulatedProfit = calculateProfit(String(baseAmount), await JSBI.toNumber(route.outAmount));

		// Alter slippage to be larger based on the profit if enabled in the config
		// set cache.config.adaptiveSlippage=1 to enable
		// Profit minus minimum profit
		// default to the set slippage
		var slippagerevised = slippage;

		if ((simulatedProfit > cache.config.minPercProfit) && cache.config.adaptiveSlippage == 1){
				var slippagerevised = (100*(simulatedProfit-cache.config.minPercProfit+(slippage/100))).toFixed(3)

				if (slippagerevised>500) {
					// Make sure on really big numbers it is only 30% of the total
					slippagerevised = (0.3*slippagerevised).toFixed(3);
				} else {
					slippagerevised = (0.8*slippagerevised).toFixed(3);
				}

				//console.log("Setting slippage to "+slippagerevised);
				route.slippageBps = slippagerevised;
		}

		// store max profit spotted
		if (
			simulatedProfit > cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"]
		) {
			cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"] = simulatedProfit;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= cache.config.minPercProfit)
		) {
			// hotkeys
			if (cache.hotkeys.e) {
				console.log("[E] PRESSED - EXECUTION FORCED BY USER!");
				cache.hotkeys.e = false;
			}
			if (cache.hotkeys.r) {
				console.log("[R] PRESSED - REVERT BACK SWAP!");
				route.otherAmountThreshold = 0;
			}

			if (cache.tradingEnabled || cache.hotkeys.r) {
				cache.swappingRightNow = true;
				// store trade to the history
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					inAmount: toDecimal(route.amount, inputToken.decimals),
					expectedOutAmount: toDecimal(route.outAmount, outputToken.decimals),
					expectedProfit: simulatedProfit,
					slippage: slippagerevised,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB,
							route,
							simulatedProfit,
						});
					}
				}, 50);

				[tx, performanceOfTx] = await swap(jupiter, route);

				// stop refreshing status
				clearInterval(printTxStatus);

				const profit = calculateProfit(
					cache.currentBalance[cache.sideBuy ? "tokenB" : "tokenA"],
					tx.outputAmount
				);

				tradeEntry = {
					...tradeEntry,
					outAmount: tx.outputAmount || 0,
					profit,
					performanceOfTx,
					error: tx.error?.code === 6001 ? "Slippage Tolerance Exceeded" : tx.error?.message || null,
				};

				var waittime = await waitabit(100);

				// handle TX results
				if (tx.error) {
					await failedSwapHandler(tradeEntry, inputToken, amountToTrade);
				}
				else {
					if (cache.hotkeys.r) {
						console.log("[R] - REVERT BACK SWAP - SUCCESS!");
						cache.tradingEnabled = false;
						console.log("TRADING DISABLED!");
						cache.hotkeys.r = false;
					}
					await successSwapHandler(tx, tradeEntry, tokenA, tokenB);
				}
			}
		}

		if (tx) {
			if (!tx.error) {
				// change side
				cache.sideBuy = !cache.sideBuy;
			}
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});

	} catch (error) {
		cache.queue[i] = 1;
		console.log(error);
	} finally {
		delete cache.queue[i];
	}
};

const arbitrageStrategy = async (jupiter, tokenA) => {

	//console.log('ARB STRAT ACTIVE');

	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;
	swapactionrun: try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		const amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance["tokenA"]
				: cache.initialBalance["tokenA"];
		const baseAmount = amountToTrade;

        //BNI AMT to TRADE
        const amountInBN = new BN(amountToTrade);
        //console.log('Amount to trade:'+amountToTrade);

		// default slippage
		const slippage = typeof cache.config.slippage === "number" ? cache.config.slippage : 1; // 100 is 0.1%

		// set input / output token
		const inputToken = tokenA;
		const outputToken = tokenA;

		// check current routes
		const performanceOfRouteCompStart = performance.now();
		const routes = await jupiter.computeRoutes({
			inputMint: new PublicKey(inputToken.address),
			outputMint: new PublicKey(outputToken.address),
			amount: amountInJSBI,
			slippageBps: slippage,
			feeBps: 0,
			forceFetch: true,
		    onlyDirectRoutes: false,
            filterTopNResult: 2,
			enforceSingleTx: false,
			swapMode: 'ExactIn',
		});

		//console.log('Routes Lookup Run for '+ inputToken.address);
		checkRoutesResponse(routes);

		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.routesInfos.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp = performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = await routes.routesInfos[0];

		// calculate profitability
		const simulatedProfit = calculateProfit(baseAmount, await JSBI.toNumber(route.outAmount));
		const minPercProfitRnd = getRandomAmt(cache.config.minPercProfit);
		//console.log('mpp:'+minPercProfitRnd);

		var slippagerevised = slippage;

		if ((simulatedProfit > cache.config.minPercProfit) && cache.config.adaptiveSlippage === 1){
				slippagerevised = (100*(simulatedProfit-minPercProfitRnd+(slippage/100))).toFixed(3)

				// Set adaptive slippage
				if (slippagerevised>500) {
						// Make sure on really big numbers it is only 30% of the total if > 50%
						slippagerevised = (0.30*slippagerevised).toFixed(3);
				} else {
						slippagerevised = (0.80*slippagerevised).toFixed(3);
				}
				//console.log("Setting slippage to "+slippagerevised);
				route.slippageBps = slippagerevised;
		}

		// store max profit spotted
		if (simulatedProfit > cache.maxProfitSpotted["buy"]) {
			cache.maxProfitSpotted["buy"] = simulatedProfit;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= minPercProfitRnd)
		) {
			// hotkeys
			if (cache.hotkeys.e) {
				console.log("[E] PRESSED - EXECUTION FORCED BY USER!");
				cache.hotkeys.e = false;
			}
			if (cache.hotkeys.r) {
				console.log("[R] PRESSED - REVERT BACK SWAP!");
				route.otherAmountThreshold = 0;
			}

			if (cache.tradingEnabled || cache.hotkeys.r) {
				cache.swappingRightNow = true;
				// store trade to the history
				console.log('swappingRightNow');
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					inAmount: toDecimal(route.amount, inputToken.decimals),
					expectedOutAmount: toDecimal(route.outAmount, outputToken.decimals),
					expectedProfit: simulatedProfit,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB: tokenA,
							route,
							simulatedProfit,
						});
					}
				}, 250);

				[tx, performanceOfTx] = await swap(jupiter, route);

				// stop refreshing status
				clearInterval(printTxStatus);

				// Calculate the profit of the trade
				const profit = calculateProfit(tradeEntry.inAmount, tx.outputAmount);

				tradeEntry = {
					...tradeEntry,
					outAmount: tx.outputAmount || 0,
					profit,
					performanceOfTx,
					error: tx.error?.code === 6001 ? "Slippage Tolerance Exceeded" : tx.error?.message || null,
					slippage: slippagerevised,
				};

				// handle TX results
				if (tx.error) {
					// Slippage tolerance exceeded
					await failedSwapHandler(tradeEntry, inputToken, amountToTrade);
				} else {
					if (cache.hotkeys.r) {
						console.log("[R] - REVERT BACK SWAP - SUCCESS!");
						cache.tradingEnabled = false;
						console.log("TRADING DISABLED!");
						cache.hotkeys.r = false;
					}
					await successSwapHandler(tx, tradeEntry, tokenA, tokenA);
				}
			}
		}

		if (tx) {
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});
	} catch (error) {
		cache.queue[i] = 1;
		throw error;
	} finally {
		delete cache.queue[i];
	}
};

const watcher = async (jupiter, tokenA, tokenB) => {
	if (
		!cache.swappingRightNow &&
		Object.keys(cache.queue).length < cache.queueThrottle
	) {
		if (cache.config.tradingStrategy === "pingpong") {
			await pingpongStrategy(jupiter, tokenA, tokenB);
		}
		if (cache.config.tradingStrategy === "arbitrage") {
			await arbitrageStrategy(jupiter, tokenA);
		}
	}
};

const run = async () => {
	try {
		// Are they ARB ready and part of the community?
		await checkArbReady();

		console.log("Starting setup process...");
		
		// Log Node.js version info for debugging
		console.log(`Node.js version: ${process.version}`);
		console.log(`Process platform: ${process.platform}`);
		console.log(`Current working directory: ${process.cwd()}`);

		try {
			// Verify temp directory and its files exist
			const tempDir = path.join(process.cwd(), 'temp');
			if (fs.existsSync(tempDir)) {
				console.log(`Temp directory exists at: ${tempDir}`);
				const files = fs.readdirSync(tempDir);
				console.log(`Files in temp directory: ${files.join(', ')}`);
				
				// Check tokens.json format
				if (files.includes('tokens.json')) {
					const tokensPath = path.join(tempDir, 'tokens.json');
					const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
					console.log(`Tokens file contains ${tokens.tokens?.length || 0} tokens`);
				}
			} else {
				console.log(`Temp directory doesn't exist, will be created during setup`);
			}
		} catch (fsError) {
			console.error("File system check error:", fsError);
		}
		
		// Continue with setup
		console.log("Calling setup function...");
		const { jupiter, tokenA, tokenB, wallet } = await setup();
		
		console.log("Setup completed successfully!");
		console.log(`Token A: ${tokenA?.symbol} (${tokenA?.address})`);
		console.log(`Token B: ${tokenB?.symbol} (${tokenB?.address})`);

		// Set pubkey display
		const walpubkeyfull = wallet.publicKey.toString();
		console.log(`Wallet Enabled: ${walpubkeyfull}`);
		cache.walletpubkeyfull = walpubkeyfull;
		cache.walletpubkey = walpubkeyfull.slice(0,5) + '...' + walpubkeyfull.slice(walpubkeyfull.length-3);
		//console.log(cache.walletpubkey);

		// Run arbitrage scanner if enabled
		if (process.env.ENABLE_ARB_SCANNER === 'true') {
			console.log(chalk.magenta.bold('\n===== STARTING ARBITRAGE SCANNER =====\n'));
			try {
				// Use wrapped SOL as the base token for price comparison
				const baseToken = {
					symbol: 'SOL',
					address: 'So11111111111111111111111111111111111111112',
					decimals: 9
				};
				
				// Get minimum profit threshold from environment or config
				const minProfitPercent = parseFloat(process.env.MIN_PROFIT_THRESHOLD) || 
										cache.config.minPercProfit || 
										1.0;
				
				// Get token limit from environment or use default
				const tokenLimit = parseInt(process.env.ARB_TOKEN_LIMIT) || 50;
				
				console.log(chalk.cyan(`Scanning with parameters:`));
				console.log(chalk.cyan(`- Base token: ${baseToken.symbol}`));
				console.log(chalk.cyan(`- Min profit: ${minProfitPercent}%`));
				console.log(chalk.cyan(`- Token limit: ${tokenLimit}`));
				
				// Scan for opportunities
				const opportunities = await scanForArbitrageOpportunities(
					jupiter, 
					baseToken, 
					minProfitPercent,
					tokenLimit
				);
				
				// Store opportunities in cache for UI display
				cache.arbitrageOpportunities = opportunities;
				
				// Allow the bot to use scan results if we're in arbitrage mode
				if (cache.config.tradingStrategy === 'arbitrage' && opportunities.length > 0) {
					console.log(chalk.green(`Found ${opportunities.length} potential trading opportunities. Will consider these in trading.`));
					
					// Schedule next scan if interval is defined
					if (process.env.ARB_SCAN_INTERVAL_MINUTES) {
						const intervalMinutes = parseInt(process.env.ARB_SCAN_INTERVAL_MINUTES);
						console.log(chalk.cyan(`Next arbitrage scan scheduled in ${intervalMinutes} minutes`));
						setTimeout(() => {
							console.log(chalk.yellow('Running scheduled arbitrage scan...'));
							// We'll recursively call the scan function
						}, intervalMinutes * 60 * 1000);
					}
				}
			} catch (error) {
				console.error('Error running arbitrage scanner:', error);
				// Continue with normal bot operation even if scanner fails
			}
		}

		// Check if live monitor is requested
		if (process.env.LIVE_MONITOR === 'true') {
			console.log(chalk.green('Starting live token price monitor...'));
			
			// Get tokens to monitor from config or environment
			const tokensToMonitor = [];
			
			// First add the trading pair if available
			if (tokenA && tokenB) {
				tokensToMonitor.push(tokenA);
				tokensToMonitor.push(tokenB);
			}
			
			// Then add any watchlist tokens from environment
			if (process.env.WATCH_TOKENS) {
				const watchAddresses = process.env.WATCH_TOKENS.split(',');
				// Fetch token metadata for these addresses
				// This would need implementation based on your token fetching approach
			}
			
			// If no tokens specified, use some defaults or popular tokens
			if (tokensToMonitor.length === 0) {
				// Add some popular tokens
				tokensToMonitor.push({
					address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
					symbol: "USDC",
					name: "USD Coin",
					decimals: 6
				});
				// Add more default tokens as needed
			}
			
			// Start the monitor
			const baseToken = {
				address: "So11111111111111111111111111111111111111112", // Wrapped SOL
				symbol: "SOL",
				name: "Wrapped SOL",
				decimals: 9
			};
			
			const refreshInterval = parseInt(process.env.MONITOR_REFRESH_INTERVAL) || 15000;
			
			const stopMonitor = await startLiveTokenMonitor(
				jupiter, 
				tokensToMonitor, 
				baseToken, 
				refreshInterval
			);
			
			// Handle graceful shutdown
			process.on('SIGINT', () => {
				console.log('Stopping price monitor...');
				stopMonitor();
				process.exit(0);
			});
			
			// Don't continue with normal bot operation
			return;
		}

		if (cache.config.tradingStrategy === "pingpong") {
			// set initial & current & last balance for tokenA
			console.log('Trade Size is:'+cache.config.tradeSize.value);

			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);
			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;

			// Double check the wallet has sufficient amount of tokenA
			var realbalanceTokenA = await checkTokenABalance(tokenA,cache.initialBalance.tokenA);

			// set initial & last balance for tokenB
			cache.initialBalance.tokenB = await getInitialotherAmountThreshold(
				jupiter,
				tokenA,
				tokenB,
				cache.initialBalance.tokenA
			);
			cache.lastBalance.tokenB = cache.initialBalance.tokenB;
		} else if (cache.config.tradingStrategy === "arbitrage") {
			// set initial & current & last balance for tokenA
			//console.log('Trade Size is:'+cache.config.tradeSize.value+' decimals:'+tokenA.decimals);

			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);

			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;

			// Double check the wallet has sufficient amount of tokenA
			var realbalanceTokenA = await checkTokenABalance(tokenA,cache.initialBalance.tokenA);

			if (realbalanceTokenA<cache.initialBalance.tokenA){
				console.log('Balance Lookup is too low for token: '+realbalanceTokenA+' < '+cache.initialBalance.tokenA);
				process.exit();
			}
		}

		global.botInterval = setInterval(
			() => watcher(jupiter, tokenA, tokenB),
			cache.config.minInterval
		);
	} catch (error) {
		logExit(error);
		process.exitCode = 1;
	}
};

run();

// handle exit
process.on("exit", handleExit);
