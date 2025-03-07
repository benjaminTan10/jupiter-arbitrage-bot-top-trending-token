#!/usr/bin/env node
"use strict";
const React = require("react");
const importJsx = require("import-jsx");
const { render } = require("ink");
const meow = require("meow");
const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");

// check for .env file
const { checkForEnvFile, checkWallet, checkArbReady, createConfigFile } = require("./utils");
const { loadConfigFromEnv } = require("./utils/envConfig");
checkForEnvFile();

require("dotenv").config();

checkWallet();

const isArbReady = async () => {
    try {
        // Display the message
        await checkArbReady();
        return true; // If checkArbReady completes without errors, return true
    } catch (error) {
        console.log(chalk.black.bgRedBright(
            `\n${error.message}\n`
        ));
        process.exit(1); // Exit the process if there's an error
    }
};

// CLI arguments
const cli = meow(`
    Usage
      $ solana-jupiter-bot [options]

    Options
      --wizard    Start the configuration wizard
      --env       Use environment variables for configuration (default)

    Examples
      $ solana-jupiter-bot --wizard
      $ solana-jupiter-bot --env
`);

const main = async () => {
    await isArbReady();
    
    console.clear();
    
    // Check if wizard flag is specified
    if (cli.flags.wizard) {
        const wizard = importJsx("./wizard/index");
        render(React.createElement(wizard, cli.flags)).waitUntilExit();
    } else {
        // Use environment variables
        const spinner = ora({
            text: "Loading configuration from environment variables...",
            color: "magenta",
        }).start();
        
        try {
            const config = loadConfigFromEnv();
            
            // Check if we have token information
            if (!config.tokenA || !config.tokenB) {
                spinner.warn("Token information not found in environment or config.json");
                spinner.info("Please run the wizard first to configure tokens: solana-jupiter-bot --wizard");
                process.exit(1);
            }
            
            // Save config to config.json for bot to use
            fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
            spinner.succeed("Configuration loaded from environment variables");
            
            // Start the bot
            spinner.text = "Starting bot...";
            spinner.start();
            require("./bot/index.js");
        } catch (error) {
            spinner.fail(`Failed to load configuration: ${error.message}`);
            process.exit(1);
        }
    }
};

main();