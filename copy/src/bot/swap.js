const { calculateProfit, toDecimal, storeItInTempAsJSON } = require("../utils");
const cache = require("./cache");
const { setTimeout } = require("timers/promises");
const { balanceCheck } = require("./setup");
const { checktrans } = require("../utils/transaction.js");
const promiseRetry = require("promise-retry");
const chalk = require('chalk');

const waitabit = async (ms) => {
	const mySecondPromise = new Promise(function(resolve,reject){
		console.log('Waiting for ' + ms + 'ms...')
		setTimeout(() => {
			reject(console.log('Error in promise'));
		},ms)
	})
}

const swap = async (jupiter, route) => {
	try {
		const performanceOfTxStart = performance.now();
		cache.performanceOfTxStart = performanceOfTxStart;

		if (process.env.DEBUG) storeItInTempAsJSON("routeInfoBeforeSwap", route);

		// Log swap details
		console.log(chalk.yellow('═════════════════════════════════════════════'));
		console.log(chalk.cyan('🔄 EXECUTING SWAP'));
		console.log(chalk.yellow('═════════════════════════════════════════════'));
		
		// Log the route details
		console.log(chalk.yellow('📊 ROUTE DETAILS:'));
		console.log(chalk.gray('- Input amount: ') + route.amount.toString());
		console.log(chalk.gray('- Expected output: ') + route.outAmount.toString());
		console.log(chalk.gray('- Slippage tolerance: ') + (route.slippageBps/100).toFixed(2) + '%');
		
		if (route.marketInfos && route.marketInfos.length > 0) {
			console.log(chalk.yellow('\n📋 ROUTE MARKETS:'));
			route.marketInfos.forEach((market, idx) => {
				console.log(`  ${idx+1}. ${chalk.cyan(market.label || 'Unknown')}`);
				console.log(`     In: ${market.inAmount}, Out: ${market.outAmount}`);
			});
		}

		// Pull the trade priority
		const priority = typeof cache.config.priority === "number" ? cache.config.priority : 100; //100 BPS default if not set
		cache.priority = priority;
		console.log(chalk.gray('- Transaction priority: ') + priority);

		console.log(chalk.yellow('\n🚀 SUBMITTING TRANSACTION...'));
		const { execute } = await jupiter.exchange({
			routeInfo: route,
			computeUnitPriceMicroLamports: priority,
		});
		const result = await execute();

		if (result.error) {
			console.log(chalk.red('❌ TRANSACTION FAILED:'));
			console.log(chalk.red(result.error.message || JSON.stringify(result.error)));
		} else {
			console.log(chalk.green('✅ TRANSACTION SUCCESSFUL!'));
			console.log(chalk.gray('- Transaction ID: ') + (result.txid || 'Unknown'));
			console.log(chalk.gray('- Input: ') + (result.inputAmount || 'Unknown'));
			console.log(chalk.gray('- Output: ') + (result.outputAmount || 'Unknown'));
		}

		if (process.env.DEBUG) storeItInTempAsJSON("result", result);

		// Reset counter on success
		cache.tradeCounter.failedbalancecheck = 0;
		cache.tradeCounter.errorcount = 0;

		const performanceOfTx = performance.now() - performanceOfTxStart;
		console.log(chalk.gray('- Transaction time: ') + performanceOfTx.toFixed(2) + 'ms');
		console.log(chalk.yellow('═════════════════════════════════════════════'));
		
		return [result, performanceOfTx];
	} catch (error) {
		console.log(chalk.red("Swap error: "), error);
		return [{error}, 0];
	}
};
exports.swap = swap;

const failedSwapHandler = async(tradeEntry, inputToken, tradeAmount) => {
	// Log failure with details
	console.log(chalk.red('\n❌ SWAP FAILED'));
	console.log(chalk.yellow('Error details:'), tradeEntry.error || 'Unknown error');
	
	// update trade counter
	cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].fail++;
	console.log(chalk.gray(`Failure count: ${cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].fail}`));

	// Update trade history if configured
	if (cache.config.storeFailedTxInHistory) {
		cache.tradeHistory.push(tradeEntry);
		console.log(chalk.gray('Added to trade history'));
	}

	// Double check the balance
	console.log(chalk.yellow('\nVerifying wallet balance...'));
	try {
		const realbalanceToken = await balanceCheck(inputToken);
		console.log(chalk.gray(`Current balance: ${toDecimal(realbalanceToken, inputToken.decimals)} ${inputToken.symbol}`));

		// If balance is insufficient, handle it
		if (Number(realbalanceToken) < Number(tradeAmount)) {
			cache.tradeCounter.failedbalancecheck++;
			console.log(chalk.red(`⚠️ Insufficient balance detected! (${cache.tradeCounter.failedbalancecheck}/5 warnings)`));

			if (cache.tradeCounter.failedbalancecheck > 5) {
				console.log(chalk.red.bold(`CRITICAL: Balance too low after ${cache.tradeCounter.failedbalancecheck} attempts`));
				console.log(chalk.red(`Required: ${toDecimal(tradeAmount, inputToken.decimals)}, Available: ${toDecimal(realbalanceToken, inputToken.decimals)}`));
				console.log(chalk.red.bold('Terminating bot for safety...'));
				process.exit();
			}
		} else {
			console.log(chalk.green('Balance check passed'));
		}
	} catch (error) {
		console.log(chalk.red('Error checking balance:'), error.message);
	}

	// Increment error count and check if too high
	cache.tradeCounter.errorcount += 1;
	console.log(chalk.gray(`Total error count: ${cache.tradeCounter.errorcount}/100`));
	
	if (cache.tradeCounter.errorcount > 100) {
		console.log(chalk.red.bold(`CRITICAL: Error count is too high (${cache.tradeCounter.errorcount})`));
		console.log(chalk.red.bold('Terminating bot to prevent transaction spam...'));
		process.exit();
	}
};
exports.failedSwapHandler = failedSwapHandler;

const successSwapHandler = async (tx, tradeEntry, tokenA, tokenB) => {
	console.log(chalk.green('\n✅ SWAP SUCCESSFUL'));
	console.log(chalk.yellow('Transaction details:'));
	console.log(chalk.gray('- Transaction ID: ') + (tx?.txid || 'Unknown'));
	console.log(chalk.gray('- Input amount: ') + tradeEntry.inAmount);
	console.log(chalk.gray('- Output amount: ') + (tx.outputAmount || 'Unknown'));
	console.log(chalk.gray('- Estimated profit: ') + (tradeEntry.profit ? `${tradeEntry.profit.toFixed(4)}%` : 'Unknown'));
	
	if (process.env.DEBUG) storeItInTempAsJSON(`txResultFromSDK_${tx?.txid}`, tx);

	// update counter
	cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].success++;
	console.log(chalk.gray(`Success count: ${cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].success}`));

	if (cache.config.tradingStrategy === "pingpong") {
		console.log(chalk.yellow('\nUpdating PingPong strategy balances...'));
		
		// update balance
		if (cache.sideBuy) {
			cache.lastBalance.tokenA = cache.currentBalance.tokenA;
			cache.currentBalance.tokenA = 0;
			cache.currentBalance.tokenB = tx.outputAmount;
			console.log(chalk.gray(`New balance: ${toDecimal(cache.currentBalance.tokenB, tokenB.decimals)} ${tokenB.symbol}`));
		} else {
			cache.lastBalance.tokenB = cache.currentBalance.tokenB;
			cache.currentBalance.tokenB = 0;
			cache.currentBalance.tokenA = tx.outputAmount;
			console.log(chalk.gray(`New balance: ${toDecimal(cache.currentBalance.tokenA, tokenA.decimals)} ${tokenA.symbol}`));
		}

		// update profit
		if (cache.sideBuy) {
			cache.currentProfit.tokenA = 0;
			cache.currentProfit.tokenB = calculateProfit(
				String(cache.initialBalance.tokenB),
				String(cache.currentBalance.tokenB)
			);
			console.log(chalk.gray(`Cumulative profit: ${cache.currentProfit.tokenB.toFixed(4)}% in ${tokenB.symbol}`));
		} else {
			cache.currentProfit.tokenB = 0;
			cache.currentProfit.tokenA = calculateProfit(
				String(cache.initialBalance.tokenA),
				String(cache.currentBalance.tokenA)
			);
			console.log(chalk.gray(`Cumulative profit: ${cache.currentProfit.tokenA.toFixed(4)}% in ${tokenA.symbol}`));
		}

		// update trade history
		let tempHistory = cache.tradeHistory;

		tradeEntry.inAmount = toDecimal(
			tx.inputAmount,
			cache.sideBuy ? tokenA.decimals : tokenB.decimals
		);
		tradeEntry.outAmount = toDecimal(
			tx.outputAmount,
			cache.sideBuy ? tokenB.decimals : tokenA.decimals
		);

		tradeEntry.profit = calculateProfit(
			String(cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"]),
			String(tx.outputAmount)
		);
		tempHistory.push(tradeEntry);
		cache.tradeHistory = tempHistory;
		console.log(chalk.gray('Trade added to history'));
	}
	else if (cache.config.tradingStrategy === "arbitrage") {
		console.log(chalk.yellow('\nUpdating Arbitrage strategy balances...'));
		
		/** check real amounts because Jupiter SDK returns wrong amounts
		 *  when trading ARB TokenA <> TokenA (arbitrage)
		 */
		try {
			// BETA LOOKUP FOR RESULT VIA RPC
			console.log(chalk.gray('Looking up transaction results from blockchain...'));
			var txresult = [];
			var err2 = -1;
			var rcount = 0;
			var retries = 30;

			const fetcher = async (retry) => {
				rcount++;
				if (rcount >= retries) {
					// Exit max retries
					console.log(chalk.red(`Reached max attempts (${retries}) to fetch transaction. Assuming it did not complete.`));
					return -1;
				}

				console.log(chalk.gray(`Transaction lookup attempt ${rcount}/${retries}...`));
				
				// Get the results of the transaction from the RPC
				// Sometimes this takes time for it to post so retry logic is implemented
				[txresult, err2] = await checktrans(tx?.txid, cache.walletpubkeyfull);
				
				if (err2 == 0 && txresult) {
					if (txresult?.[tokenA.address]?.change > 0) {
						console.log(chalk.green(`Found transaction with positive change: ${txresult?.[tokenA.address]?.change}`));

						// update balance
						cache.lastBalance.tokenA = cache.currentBalance.tokenA;
						cache.currentBalance.tokenA = (cache.currentBalance.tokenA + txresult?.[tokenA.address]?.change);
						console.log(chalk.gray(`Updated balance: ${toDecimal(cache.currentBalance.tokenA, tokenA.decimals)} ${tokenA.symbol}`));
					
						// update profit
						cache.currentProfit.tokenA = calculateProfit(
							String(cache.initialBalance.tokenA),
							String(cache.currentBalance.tokenA)
						);
						console.log(chalk.gray(`Cumulative profit: ${cache.currentProfit.tokenA.toFixed(4)}% in ${tokenA.symbol}`));

						// update trade history
						let tempHistory = cache.tradeHistory;

						tradeEntry.inAmount = toDecimal(
							cache.lastBalance.tokenA, tokenA.decimals
						);
						tradeEntry.outAmount = toDecimal(
							cache.currentBalance.tokenA, tokenA.decimals
						);

						tradeEntry.profit = calculateProfit(
							String(cache.lastBalance.tokenA),
							String(cache.currentBalance.tokenA)
						);
						tempHistory.push(tradeEntry);
						cache.tradeHistory = tempHistory;
						console.log(chalk.gray('Trade added to history'));

						return txresult;
					} else {
						console.log(chalk.yellow('Transaction found but no token change detected yet. Retrying...'));
						retry(new Error("Transaction was not posted yet... Retrying..."));
					}
				} else if(err2 == 2) {
					// Transaction failed. Kill it and retry
					console.log(chalk.red('Transaction failed on-chain.'));
					return -1;
				} else {
					console.log(chalk.yellow('Transaction not found yet. Retrying...'));
					retry(new Error("Transaction was not posted yet. Retrying..."));
				}
			};

			const lookresult = await promiseRetry(fetcher, {
				retries: retries,
				minTimeout: 1000,
				maxTimeout: 4000,
				randomize: true,
			});

			if (lookresult == -1) {
				console.log(chalk.red('Transaction lookup failed or transaction was unsuccessful.'));
			} else {
				// Log detailed results from the lookup
				console.log(chalk.green('Transaction lookup successful!'));
				console.log(chalk.yellow('Transaction details:'));
				
				const inputamt = txresult[tokenA.address].start;
				const outputamt = txresult[tokenA.address].end;
				const profit = calculateProfit(
					inputamt,
					outputamt
				);
				
				console.log(chalk.gray('- Initial amount: ') + toDecimal(inputamt, tokenA.decimals) + ' ' + tokenA.symbol);
				console.log(chalk.gray('- Final amount: ') + toDecimal(outputamt, tokenA.decimals) + ' ' + tokenA.symbol);
				console.log(chalk.gray('- Profit: ') + profit.toFixed(4) + '%');
			}
		} catch (error) {
			console.log(chalk.red("Error fetching transaction result: "), error);  
		}
	}
	
	console.log(chalk.yellow('═════════════════════════════════════════════'));
};
exports.successSwapHandler = successSwapHandler;
