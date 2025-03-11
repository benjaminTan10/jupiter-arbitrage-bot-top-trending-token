console.clear();

require("dotenv").config();
const {clearInterval} = require("timers");
const {PublicKey} = require("@solana/web3.js");
const BN = require('bn.js');
const {setTimeout} = require("timers/promises");
const {
	calculateProfit,
	toDecimal,
	toNumber,
	updateIterationsPerMin,
	checkRoutesResponse,
	checkArbReady,
} = require("../utils");
const {handleExit,logExit} = require("./exit");
const cache = require("./cache");
const {setup,getInitialotherAmountThreshold,checkTokenABalance,rotateToNextToken} = require("./setup");
const {printToConsole} = require("./ui/");
const {swap,failedSwapHandler,successSwapHandler} = require("./swap");
const chalk = require('chalk');

// Force disable intro animation by setting environment variable
process.env.SKIP_INTRO = "true";

const waitabit = async (ms) => {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		},ms);
	});
};

function getRandomAmt(runtime) {
	const min = Math.ceil((runtime * 10000) * 0.99);
	const max = Math.floor((runtime * 10000) * 1.01);
	return ((Math.floor(Math.random() * (max - min + 1)) + min) / 10000);
}

// Add this function near the top of the file, after the imports
const safeToNumber = (value) => {
	try {
		// If it's already a number, return it
		if(typeof value === 'number') return value;

		// If it's a BN instance, use its toNumber method
		if(value && typeof value.toNumber === 'function') {
			return value.toNumber();
		}

		// If it's a string or other type, convert to BN first
		return new BN(value).toNumber();
	} catch(error) {
		console.error('Error converting value to number:',error);
		// Return 0 or some default value as fallback
		return 0;
	}
};

// Function to watch for arbitrage opportunities
const watcher = async (jupiter,tokenA,tokenB) => {
	console.log(chalk.cyan('═════════════════════════════════════════════'));
	console.log(chalk.yellow(`🔍 CHECKING MARKET: ${tokenA.symbol} ↔ ${tokenB.symbol}`));
	console.log(chalk.cyan('═════════════════════════════════════════════'));

	try {
		// Check for manual rotation request
		if(cache.manualRotation) {
			console.log(chalk.magentaBright("Manual token rotation requested..."));
			cache.manualRotation = false;

			// Get the next token
			const newTokenB = rotateToNextToken();

			if(newTokenB) {
				tokenB = newTokenB;
				console.log(chalk.cyan("═════════════════════════════════════════════"));
				console.log(chalk.yellow(`🔄 ROTATING TO NEW TOKEN: ${tokenB.symbol}`));
				console.log(chalk.cyan("═════════════════════════════════════════════"));

				// Reset iteration counter for the new token
				cache.iteration = 0;
			}
		}

		// Determine which strategy to use based on configuration
		if(cache.config.tradingStrategy === "arbitrage") {
			await arbitrageStrategy(jupiter,tokenA,tokenB);
		} else {
			console.log(chalk.red("Unknown or unsupported strategy: " + cache.config.tradingStrategy));
		}
	} catch(error) {
		console.error(chalk.red("Error in watcher:"),error);
	}
};

const arbitrageStrategy = async (jupiter,tokenA,tokenB) => {
	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;

	console.log(chalk.cyan('═════════════════════════════════════════════'));
	console.log(chalk.yellow('👮‍♂️ arbitrageStrategy ... 👮‍♂️'));
	console.log(chalk.cyan('═════════════════════════════════════════════'));

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
		console.log(chalk.gray('Checking routes for amount:') + toDecimal(amountToTrade,tokenA.decimals) + ' ' + tokenA.symbol);

		// default slippage
		const slippage = typeof cache.config.slippage === "number" ? cache.config.slippage : 1; // 100 is 0.1%

		// set input / output token
		const inputToken = tokenA;
		const outputToken = tokenB;

		// check current routes
		const performanceOfRouteCompStart = performance.now();
		console.log(chalk.gray('Computing routes...'));
		console.log(chalk.gray('Input token: ') + inputToken.symbol);
		console.log(chalk.gray('Output token: ') + outputToken.symbol);
		console.log(chalk.gray('Amount to trade: ') + toDecimal(amountToTrade,inputToken.decimals));
		console.log(chalk.gray('Slippage: ') + slippage);
		// First route to find best DEX A
		const routes = await jupiter.computeRoutes({
			inputMint: new PublicKey(inputToken.address),
			outputMint: new PublicKey(outputToken.address),
			amount: amountInBN,
			slippageBps: slippage,
			forceFetch: true,
			onlyDirectRoutes: false,
			filterTopNResult: 1,
		});

		checkRoutesResponse(routes);

		// count available routes
		cache.availableRoutes["buy"] = routes.routesInfos.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp = performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = routes.routesInfos[0];

		// calculate profitability
		const simulatedProfit = calculateProfit(String(baseAmount),safeToNumber(route.outAmount));

		// randomize min perc profit threshold with 1% to avoid bot detection
		const minPercProfitRnd = getRandomAmt(cache.config.minPercProfit);

		// Adaptive slippage feature
		var slippagerevised = slippage;

		if((simulatedProfit > minPercProfitRnd) && cache.config.adaptiveSlippage == 1) {
			var slippagerevised = (100 * (simulatedProfit - minPercProfitRnd + (slippage / 100))).toFixed(3);

			if(slippagerevised > 500) {
				// Make sure on really big numbers it is only 30% of the total
				slippagerevised = (0.3 * slippagerevised).toFixed(3);
			} else {
				slippagerevised = (0.8 * slippagerevised).toFixed(3);
			}

			console.log(chalk.gray("Setting adaptive slippage to: ") + chalk.yellow(slippagerevised) + " bps");
			route.slippageBps = slippagerevised;
		}

		// store max profit spotted
		if(simulatedProfit > cache.maxProfitSpotted["buy"]) {
			cache.maxProfitSpotted["buy"] = simulatedProfit;
		}

		console.log(chalk.yellow('═════════════════════════════════════════════'));
		console.log(chalk.cyan('🔍 ARBITRAGE SCAN RESULTS'));
		console.log(chalk.yellow('═════════════════════════════════════════════'));
		console.log(chalk.gray('Token: ') + tokenA.symbol + ' (' + tokenA.address.substring(0,8) + '...)');
		console.log(chalk.gray('Amount: ') + toDecimal(amountToTrade,tokenA.decimals) + ' ' + tokenA.symbol);
		console.log(chalk.gray('Routes found: ') + routes.routesInfos.length);

		console.log(chalk.yellow('\n📊 BEST ROUTE DETAILS:'));
		if(route.marketInfos && route.marketInfos.length > 0) {
			route.marketInfos.forEach((market,idx) => {
				console.log(`  ${idx + 1}. ${chalk.cyan(market.label || 'Unknown')} (${market.id?.substring(0,8) || 'Unknown ID'})`);
				console.log(`     In: ${toDecimal(market.inAmount,tokenA.decimals)}, Out: ${toDecimal(market.outAmount,tokenA.decimals)}`);
			});
		}

		console.log(chalk.yellow('\n💹 PROFIT ANALYSIS:'));
		console.log(chalk.gray('Simulated profit: ') + (simulatedProfit > 0 ?
			chalk.green(simulatedProfit.toFixed(4) + '%') :
			chalk.red(simulatedProfit.toFixed(4) + '%')));
		console.log(chalk.gray('Required profit: ') + chalk.cyan(minPercProfitRnd.toFixed(4) + '%'));
		console.log(chalk.gray('Slippage tolerance: ') + chalk.cyan((slippagerevised / 100).toFixed(2) + '%'));
		console.log(chalk.gray('Profit threshold met: ') + (simulatedProfit >= minPercProfitRnd ?
			chalk.green('YES') :
			chalk.red('NO')));

		// check profitability and execute tx
		let tx,performanceOfTx;
		if(
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= minPercProfitRnd)
		) {
			// hotkeys
			if(cache.hotkeys.e) {
				console.log(chalk.magentaBright("[E] PRESSED - EXECUTION FORCED BY USER!"));
				cache.hotkeys.e = false;
			}
			if(cache.hotkeys.r) {
				console.log(chalk.magentaBright("[R] PRESSED - REVERT BACK SWAP!"));
				route.otherAmountThreshold = 0;
			}

			if(cache.tradingEnabled || cache.hotkeys.r) {
				cache.swappingRightNow = true;
				// store trade to the history
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: true,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					inAmount: toDecimal(route.amount,inputToken.decimals),
					expectedOutAmount: toDecimal(route.outAmount,outputToken.decimals),
					expectedProfit: simulatedProfit,
					slippage: slippagerevised,
				};

				console.log(chalk.magentaBright("\n⚡ EXECUTING ARBITRAGE TRADE ⚡"));

				[tx,performanceOfTx] = await swap(jupiter,route);

				const profit = calculateProfit(
					cache.currentBalance["tokenA"],
					tx.outputAmount
				);

				tradeEntry = {
					...tradeEntry,
					outAmount: tx.outputAmount || 0,
					profit,
					performanceOfTx,
					error: tx.error?.code === 6001 ? "Slippage Tolerance Exceeded" : tx.error?.message || null,
				};

				// handle TX results
				if(tx.error) {
					await failedSwapHandler(tradeEntry,inputToken,amountToTrade);
				}
				else {
					if(cache.hotkeys.r) {
						console.log(chalk.magentaBright("[R] - REVERT BACK SWAP - SUCCESS!"));
						cache.tradingEnabled = false;
						console.log(chalk.red("TRADING DISABLED!"));
						cache.hotkeys.r = false;
					}
					await successSwapHandler(tx,tradeEntry,tokenA,tokenB);
				}
			}
		}

		if(tx) {
			cache.swappingRightNow = false;
		}

	} catch(error) {
		cache.queue[i] = 1;
		console.error(chalk.red("Error in arbitrage strategy:"),error);
	} finally {
		delete cache.queue[i];
	}
};

const run = async () => {
	try {
		console.log(chalk.cyan("Starting Jupiter arbitrage bot..."));

		// Are they ARB ready and part of the community?
		await checkArbReady();

		// set everything up
		console.log(chalk.cyan("Setting up Jupiter client and wallet..."));
		let result = await setup();
		let {jupiter,tokenA,tokenB,wallet} = result;

		// Define a function for token rotation that can be called later
		const rotateToken = async () => {
			// Reset necessary state before switching tokens
			cache.maxProfitSpotted = {
				buy: 0,
				sell: 0,
			};

			// Get the next token
			const newTokenB = rotateToNextToken();

			if(newTokenB) {
				tokenB = newTokenB;
				console.log(chalk.cyan("═════════════════════════════════════════════"));
				console.log(chalk.yellow(`🔄 ROTATING TO NEW TOKEN: ${tokenB.symbol}`));
				console.log(chalk.cyan("═════════════════════════════════════════════"));

				// Reset iteration counter for the new token
				cache.iteration = 0;

				// Clear existing interval
				if(global.botInterval) {
					clearInterval(global.botInterval);
				}

				// Start new monitoring interval
				global.botInterval = setInterval(
					() => watcher(jupiter,tokenA,tokenB),
					cache.config.minInterval
				);
			}
		};

		// Set rotation interval (e.g., every 5 minutes)
		const rotationIntervalMinutes = process.env.TOKEN_ROTATION_INTERVAL_MINUTES || 5;
		console.log(chalk.cyan(`Token rotation interval set to ${rotationIntervalMinutes} minutes`));

		// Schedule token rotation
		global.tokenRotationInterval = setInterval(
			rotateToken,
			rotationIntervalMinutes * 60 * 1000
		);

		console.log(chalk.yellow("═════════════════════════════════════════════"));
		console.log(chalk.cyan("🚀 BOT INITIALIZED SUCCESSFULLY"));
		console.log(chalk.yellow("═════════════════════════════════════════════"));

		console.log(chalk.cyan("Token details:"));
		console.log(chalk.gray("- Token A: ") + tokenA.symbol + " (" + tokenA.address + ")");
		if(tokenB) {
			console.log(chalk.gray("- Token B: ") + tokenB.symbol + " (" + tokenB.address + ")");
		}

		// Set pubkey display
		const walpubkeyfull = wallet.publicKey.toString();
		console.log(chalk.cyan("Wallet details:"));
		console.log(chalk.gray("- Address: ") + walpubkeyfull);
		cache.walletpubkeyfull = walpubkeyfull;
		cache.walletpubkey = walpubkeyfull.slice(0,5) + '...' + walpubkeyfull.slice(walpubkeyfull.length - 3);

		// Configure balance for arbitrage strategy
		console.log(chalk.cyan("Setting up trading parameters..."));
		console.log(chalk.gray("- Trading strategy: ") + cache.config.tradingStrategy);
		console.log(chalk.gray("- Trade size: ") + cache.config.tradeSize.value + " " + tokenA.symbol);

		cache.initialBalance.tokenA = toNumber(
			cache.config.tradeSize.value,
			tokenA.decimals
		);

		cache.currentBalance.tokenA = cache.initialBalance.tokenA;
		cache.lastBalance.tokenA = cache.initialBalance.tokenA;

		// Double check the wallet has sufficient amount of tokenA
		console.log(chalk.cyan("Checking wallet balance..."));
		var realbalanceTokenA = await checkTokenABalance(tokenA,cache.initialBalance.tokenA);

		if(realbalanceTokenA < cache.initialBalance.tokenA) {
			console.log(chalk.red('Insufficient balance for token: ' + tokenA.symbol));
			console.log(chalk.red('Available: ' + realbalanceTokenA + ' vs Required: ' + cache.initialBalance.tokenA));
			process.exit(1);
		}

		console.log(chalk.green("Wallet balance sufficient for trading."));
		console.log(chalk.gray("- Available: ") + toDecimal(realbalanceTokenA,tokenA.decimals) + " " + tokenA.symbol);

		console.log(chalk.cyan("\nStarting market monitor..."));
		console.log(chalk.gray("- Update interval: ") + cache.config.minInterval + "ms");
		console.log(chalk.gray("- Min profit threshold: ") + cache.config.minPercProfit + "%");
		console.log(chalk.gray("- Token rotation interval: ") + rotationIntervalMinutes + " minutes");

		console.log(chalk.yellow("\n═════════════════════════════════════════════"));
		console.log(chalk.cyan("💻 MONITORING ACTIVE - PRESS [CTRL+C] TO EXIT"));
		console.log(chalk.yellow("═════════════════════════════════════════════"));

		// Start the watcher with an interval
		global.botInterval = setInterval(
			() => watcher(jupiter,tokenA,tokenB),
			cache.config.minInterval
		);

	} catch(error) {
		console.error(chalk.red("Error during bot initialization:"),error);
		logExit(1,error);
		process.exitCode = 1;
		process.exit(1);
	}
};

// Modify exit handler to also clean up rotation interval
process.on("exit",() => {
	if(global.tokenRotationInterval) {
		clearInterval(global.tokenRotationInterval);
	}
	handleExit();
});

// Start the bot
run();
