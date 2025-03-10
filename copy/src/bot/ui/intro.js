const ui = require("cliui")({ width: 140 });
const chalk = require("chalk");
const gradient = require("gradient-string");

const package = require("../../../package.json");
const { DISCORD_INVITE_URL } = require("../../constants");

// Modified intro function that skips the animation
async function intro(skipAnimation = true) {
	try {
		// Display a simple static header instead of animation
		console.clear();
		console.log("\n");
		console.log(chalk.bold.cyan("════════════════════════════════════════"));
		console.log(chalk.bold.cyan("        JUPITER TOKEN MONITOR"));
		console.log(chalk.bold.cyan(`           v${package.version}`));
		console.log(chalk.bold.cyan("════════════════════════════════════════"));
		console.log("\n");
		console.log(chalk.gray(`Discord: ${DISCORD_INVITE_URL}`));
		console.log("\n");
		
		return;
	} catch (error) {
		console.log(error);
	}
}

module.exports = intro;
