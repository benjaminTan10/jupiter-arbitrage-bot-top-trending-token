const chalk = require("chalk");
const moment = require("moment");
const chart = require("asciichart");
const JSBI = require('jsbi');

const { toDecimal } = require("../../utils");
const cache = require("../cache");

function printToConsole({
	date,
	i,
	side,
	route,
	inAmount,
	outAmount,
	impact,
	slippage,
	minOut,
	profit,
	profitUsd,
	difference,
	lpFees,
	timings,
	chartData,
	skipLog = false
}) {
	try {
		if(!skipLog) {
			console.clear();
			
			// Skip the chart rendering to avoid ASCII art
			// if(chartData) {
			// 	const config = {
			// 		height: 7,
			// 		colors: [chalk.green],
			// 	};
			// 	console.log(chart.plot(chartData, config));
			// }
			
			// Show cleaner output with just relevant information
			console.log("\n═════════════ JUPITER PRICE MONITOR ═════════════\n");
			
			console.log(chalk.bold("MARKET PARAMETERS:"));
			console.log(`${chalk.gray("Time:")} ${date}`);
			console.log(`${chalk.gray("Iteration:")} ${i}`);
			console.log(`${chalk.gray("Route:")} ${route}`);

			// Price and token information
			console.log(chalk.bold("\nPRICE DATA:"));
			console.log(`${chalk.gray("Input Amount:")} ${inAmount}`);
			console.log(`${chalk.gray("Output Amount:")} ${outAmount}`);
			
			// Only show profit info if it exists
			if (profit) {
				console.log(chalk.bold("\nARBITRAGE METRICS:"));
				console.log(`${chalk.gray("Profit:")} ${profit} (${profitUsd})`);
				console.log(`${chalk.gray("Difference:")} ${difference}`);
			}
			
			// Show less important info in a smaller section
			console.log(chalk.bold("\nMARKET METRICS:"));
			console.log(`${chalk.gray("Price Impact:")} ${impact}`);
			console.log(`${chalk.gray("Slippage:")} ${slippage}%`);
			console.log(`${chalk.gray("Minimum Out:")} ${minOut}`);
			console.log(`${chalk.gray("LP Fees:")} ${lpFees}`);
			
			// Hotkeys help in a smaller, less obtrusive format
			console.log(chalk.gray("\nHOTKEYS: [H]elp [P]rofit [T]rade History [S]im Mode [CTRL+C] Exit"));
		}
	} catch (error) {
		console.error("Error in printToConsole:", error);
	}
}

module.exports = printToConsole;
