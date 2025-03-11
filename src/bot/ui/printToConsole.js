const chalk = require("chalk");
const moment = require("moment");
const chart = require("asciichart");

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
	skipLog = false
}) {
	try {
		if(!skipLog) {
			console.clear();
			
			// Show main title and status
			console.log("\n" + chalk.bold.cyan("═══════════════ JUPITER ARBITRAGE MONITOR ═══════════════\n"));
			
			// Basic info section
			console.log(chalk.bold.yellow("📊 MONITORING STATUS:"));
			console.log(`${chalk.gray("Time:")} ${date.toLocaleString()}`);
			console.log(`${chalk.gray("Iteration:")} ${i} (${cache.iterationPerMinute.value} iterations/min)`);
			console.log(`${chalk.gray("Trading Enabled:")} ${cache.tradingEnabled ? chalk.green("YES") : chalk.red("NO")}`);
			console.log(`${chalk.gray("Wallet:")} ${cache.walletpubkey || "unknown"}`);
			
			// Token rotation information
			console.log(chalk.bold.yellow("\n🔄 TOKEN ROTATION:"));
			console.log(`${chalk.gray("Current Token:")} ${chalk.cyan(tokenB.symbol)} (#${cache.currentRotationIndex + 1} of ${cache.tokenRotationList?.length || 0})`);
			console.log(`${chalk.gray("Next Rotation:")} ${chalk.cyan(new Date(
			  Date.now() + ((process.env.TOKEN_ROTATION_INTERVAL_MINUTES || 5) * 60 * 1000) - (Date.now() % 60000)
			).toLocaleTimeString())}`);
			
			// Token information
			console.log(chalk.bold.yellow("\n💰 TOKEN DETAILS:"));
			console.log(`${chalk.gray("Token A:")} ${chalk.cyan(tokenA.symbol)} (${chalk.gray(tokenA.address.substring(0, 6) + '...' + tokenA.address.substring(tokenA.address.length - 4))})`);
			if (tokenB && tokenB.symbol) {
				console.log(`${chalk.gray("Token B:")} ${chalk.cyan(tokenB.symbol)} (${chalk.gray(tokenB.address.substring(0, 6) + '...' + tokenB.address.substring(tokenB.address.length - 4))})`);
				if (tokenB.daily_volume) {
					console.log(`${chalk.gray("Daily Volume:")} ${chalk.green("$" + (tokenB.daily_volume || 0).toLocaleString())}`);
				}
			}
			
			// Current trade/route information
			if (route) {
				console.log(chalk.bold.yellow("\n📈 CURRENT ROUTE INFO:"));
				console.log(`${chalk.gray("Input:")} ${chalk.green(toDecimal(route.amount, inputToken.decimals))} ${inputToken.symbol}`);
				console.log(`${chalk.gray("Output:")} ${chalk.green(toDecimal(route.outAmount, outputToken.decimals))} ${outputToken.symbol}`);
				console.log(`${chalk.gray("Route Performance:")} ${chalk.yellow(performanceOfRouteComp.toFixed(2))}ms`);
				
				// Display market makers if available
				if (route.marketInfos && route.marketInfos.length > 0) {
					console.log(chalk.bold.yellow("\n🏛️ LIQUIDITY SOURCES:"));
					route.marketInfos.forEach((market, index) => {
						console.log(`  ${index + 1}. ${chalk.cyan(market.label || "Unknown")} - ${chalk.gray(market.id?.substring(0, 8) || "Unknown ID")}`);
					});
				}
				
				// Profit information
				console.log(chalk.bold.yellow("\n💸 PROFIT CALCULATION:"));
				console.log(`${chalk.gray("Simulated Profit:")} ${simulatedProfit > 0 ? chalk.green(simulatedProfit.toFixed(4) + "%") : chalk.red(simulatedProfit.toFixed(4) + "%")}`);
				console.log(`${chalk.gray("Min. Required Profit:")} ${chalk.yellow(cache.config.minPercProfit + "%")}`);
				console.log(`${chalk.gray("Slippage:")} ${chalk.yellow((route.slippageBps / 100).toFixed(2) + "%")}`);
				
				// Current trade status
				if (cache.swappingRightNow) {
					console.log(chalk.bold.magentaBright("\n⚡ EXECUTING TRADE NOW! ⚡"));
				}
			} else {
				console.log(chalk.bold.red("\nNo routes available for this token pair"));
			}
			
			// Stats section
			console.log(chalk.bold.yellow("\n📝 STATISTICS:"));
			console.log(`${chalk.gray("Success Trades:")} ${chalk.green(cache.tradeCounter.buy.success + cache.tradeCounter.sell.success)}`);
			console.log(`${chalk.gray("Failed Trades:")} ${chalk.red(cache.tradeCounter.buy.fail + cache.tradeCounter.sell.fail)}`);
			console.log(`${chalk.gray("Max Profit Spotted:")} ${chalk.green(cache.maxProfitSpotted.buy.toFixed(4) + "%")}`);
			
			// Recent trade history (limited to last 3)
			if (cache.tradeHistory && cache.tradeHistory.length > 0) {
				console.log(chalk.bold.yellow("\n🔄 RECENT TRADES:"));
				
				const recentTrades = cache.tradeHistory.slice(-3);
				recentTrades.forEach((trade, index) => {
					const result = trade.error ? chalk.red("❌ FAILED") : chalk.green("✅ SUCCESS");
					console.log(`  ${index + 1}. ${result} | ${trade.date.substring(11)} | ${chalk.cyan(trade.inputToken)} → ${chalk.cyan(trade.outputToken)} | Profit: ${trade.profit > 0 ? chalk.green(trade.profit.toFixed(4) + "%") : chalk.red(trade.profit.toFixed(4) + "%")}`);
					if (trade.error) {
						console.log(`     Error: ${chalk.red(trade.error.substring(0, 50) + (trade.error.length > 50 ? '...' : ''))}`);
					}
				});
			}
			
			// Hotkeys reminder at bottom
			console.log(chalk.gray("\nHOTKEYS: [H]elp [P]rofit [T]rade History [S]im Mode [CTRL+C] Exit"));
		}
	} catch (error) {
		console.error("Error in printToConsole:", error);
	}
}

module.exports = printToConsole;
