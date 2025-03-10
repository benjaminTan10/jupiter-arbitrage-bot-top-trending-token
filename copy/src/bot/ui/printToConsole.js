const chalk = require("chalk");
const moment = require("moment");
const chart = require("asciichart");
const JSBI = require('jsbi');

const { toDecimal } = require("../../utils");
const cache = require("../cache");

function printToConsole({
	date,
	i,
	performanceOfRouteComp,
	inputToken,
	outputToken,
	tokenA,
	tokenB,
	route,
	simulatedProfit,
}) {
	try {
		if (cache.ui.allowClear) {
			// update max profitability spotted chart
			if (cache.ui.showProfitChart) {
				let spottetMaxTemp =
					cache.chart.spottedMax[cache.sideBuy ? "buy" : "sell"];
				spottetMaxTemp.shift();
				spottetMaxTemp.push(
					simulatedProfit === Infinity
						? 0
						: parseFloat(simulatedProfit.toFixed(2))
				);
				cache.chart.spottedMax.buy = spottetMaxTemp;
			}

			// update performance chart
			if (cache.ui.showPerformanceOfRouteCompChart) {
				let performanceTemp = cache.chart.performanceOfRouteComp;
				performanceTemp.shift();
				performanceTemp.push(parseInt(performanceOfRouteComp.toFixed()));
				cache.chart.performanceOfRouteComp = performanceTemp;
			}

			// check swap / fetch result status
			let statusMessage = " ";
			let statusPerformance;
			if (cache.swappingRightNow) {
				statusPerformance = performance.now() - cache.performanceOfTxStart;
				statusMessage = chalk[
					statusPerformance < 45000
						? "greenBright"
						: statusPerformance < 60000
						? "yellowBright"
						: "redBright"
				](`SWAPPING ... ${(statusPerformance / 1000).toFixed(2)} s`);
			} else if (cache.fetchingResultsFromSolscan) {
				statusPerformance =
					performance.now() - cache.fetchingResultsFromSolscanStart;
				statusMessage = chalk[
					statusPerformance < 45000
						? "greenBright"
						: statusPerformance < 90000
						? "yellowBright"
						: "redBright"
				](`FETCHING RESULT ... ${(statusPerformance / 1000).toFixed(2)} s`);
			}

			// refresh console before print
			console.clear();
			
			// Simple header
			console.log(chalk.bold.cyan("\n========== ARBITRAGE BOT RUNNING ==========\n"));
			
			// Display current status
			console.log(chalk.yellow("TIME:"), date.toLocaleString());
			console.log(chalk.yellow("ITERATION:"), i, `(${cache.iterationPerMinute.value} i/min)`);
			console.log(chalk.yellow("RPC:"), cache.ui.hideRpc ? `${cache.config.rpc[0].slice(0, 5)}...${cache.config.rpc[0].slice(-5)}` : cache.config.rpc[0]);
			console.log(chalk.yellow("TOKEN:"), `${tokenA.symbol} (${tokenA.address.slice(0, 8)}...)`);
			console.log(chalk.yellow("TRADING ENABLED:"), cache.tradingEnabled ? "YES" : "NO");
			console.log(chalk.yellow("STATUS:"), statusMessage);
			console.log(chalk.yellow("WALLET:"), cache.walletpubkey);
			
			// Line break
			console.log("\n" + chalk.gray("-".repeat(50)) + "\n");
			
			// Display simulated profit
			console.log(chalk.yellow("SIMULATED PROFIT:"), 
				chalk[simulatedProfit > 0 ? "green" : "red"](`${simulatedProfit.toFixed(4)} %`));
			
			// Display routes
			console.log(chalk.yellow("ROUTES AVAILABLE:"),
				`${cache.availableRoutes[cache.sideBuy ? "buy" : "sell"]}`);
				
			// Line break
			console.log("\n" + chalk.gray("-".repeat(50)) + "\n");
			
			// Display token balances and profits
			console.log(chalk.yellow("CURRENT BALANCE:"), 
				`${toDecimal(String(cache.currentBalance.tokenA), tokenA.decimals)} ${tokenA.symbol}`);
			
			console.log(chalk.yellow("INITIAL BALANCE:"), 
				`${toDecimal(String(cache.initialBalance.tokenA), tokenA.decimals)} ${tokenA.symbol}`);
			
			console.log(chalk.yellow("PROFIT:"), 
				chalk[cache.currentProfit.tokenA > 0 ? "green" : "red"](`${cache.currentProfit.tokenA.toFixed(4)} %`));
			
			// Line break
			console.log("\n" + chalk.gray("-".repeat(50)) + "\n");

			// Display profit chart if enabled
			if (cache.ui.showProfitChart) {
				console.log(chalk.yellow("PROFIT CHART:"));
				console.log(chart.plot(cache.chart.spottedMax[cache.sideBuy ? "buy" : "sell"], {
					height: 6,
					colors: [simulatedProfit > 0 ? chart.green : chart.red],
				}));
				console.log();
			}

			// Display max profit spotted
			console.log(chalk.yellow("MAX PROFIT SPOTTED:"), 
				`${cache.maxProfitSpotted.buy.toFixed(4)} %`);
			
			console.log(chalk.yellow("ADAPTIVE SLIPPAGE:"), 
				(cache.config.adaptiveSlippage==1) ? 'ENABLED' : 'DISABLED');
			
			// Line break
			console.log("\n" + chalk.gray("-".repeat(50)) + "\n");

			// Display trade history if enabled
			if (cache.ui.showTradeHistory && cache?.tradeHistory?.length > 0) {
				console.log(chalk.yellow("RECENT TRADES:"));
				console.log(chalk.gray("TIME".padEnd(20) + "SIDE".padEnd(6) + "IN".padEnd(15) + "OUT".padEnd(15) + "PROFIT".padEnd(15) + "ERROR"));
				
				const tableData = [...cache.tradeHistory].slice(-5);
				tableData.forEach((entry) => {
					console.log(
						entry.date.padEnd(20) +
						(entry.buy ? "BUY" : "SELL").padEnd(6) +
						`${entry.inAmount} ${entry.inputToken}`.padEnd(15) +
						`${entry.outAmount} ${entry.outputToken}`.padEnd(15) +
						chalk[entry.profit > 0 ? "green" : entry.profit < 0 ? "red" : "cyan"](`${isNaN(entry.profit) ? "0" : entry.profit.toFixed(2)}%`).padEnd(15) +
						(entry.error ? chalk.red(entry.error) : "-")
					);
				});
				console.log();
			}
			
			// Hotkey help
			console.log(chalk.gray("HOTKEYS: [H]elp [P]rofit Chart [T]rade History [S]imulation Mode [CTRL+C] Exit"));
		}
	} catch (error) {
		console.error("Error in printToConsole:", error);
	}
}

module.exports = printToConsole;
