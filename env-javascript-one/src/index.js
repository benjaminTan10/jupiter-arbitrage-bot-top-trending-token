#!/usr/bin/env node
"use strict";
const React = require("react");
const importJsx = require("import-jsx");
const {render} = require("ink");
const meow = require("meow");
const fs = require("fs");
const chalk = require("chalk");
const ora = require("ora-classic");
const path = require("path");

// check for .env file
const {checkForEnvFile,checkWallet,checkArbReady,createConfigFile,createTempDir} = require("./utils");
const {loadConfigFromEnv} = require("./utils/envConfig");
checkForEnvFile();

require("dotenv").config();

checkWallet();

// Ensure temp directory exists before anything else
console.log('Initializing directories...');
createTempDir();

const isArbReady = async () => {
    try {
        // Display the message
        await checkArbReady();
        return true; // If checkArbReady completes without errors, return true
    } catch(error) {
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
    if(cli.flags.wizard) {
        const wizard = importJsx("./wizard/index");
        render(React.createElement(wizard,cli.flags)).waitUntilExit();
    } else {
        // Use environment variables
        const spinner = ora({
            text: "Loading configuration from environment variables...",
            color: "magenta",
        }).start();

        try {
            const config = loadConfigFromEnv();

            // Check if we have token information
            if(!config.tokenA || !config.tokenB) {
                spinner.warn("Token information not found in environment or config.json");
                spinner.info("Please run the wizard first to configure tokens: solana-jupiter-bot --wizard");
                process.exit(1);
            }

            // Log configuration details
            console.log("Configuration loaded:");
            console.log(`Network: ${config.network}`);
            console.log(`RPC: ${config.rpc[0]}`);
            console.log(`Token A: ${config.tokenA.symbol}`);
            console.log(`Token B: ${config.tokenB.symbol}`);
            console.log(`Trade size: ${config.tradeSize.value} ${config.tokenA.symbol}`);

            // Save config to config.json for bot to use
            fs.writeFileSync("./config.json",JSON.stringify(config,null,2));
            spinner.succeed("Configuration loaded from environment variables");

            // Ensure tokens.json exists in temp directory
            const tempDir = path.join(process.cwd(),'temp');
            const tokensPath = path.join(tempDir,'tokens.json');

            if(!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir,{recursive: true});
            }

            if(!fs.existsSync(tokensPath)) {
                // Create tokens.json with the tokens from config
                const tokensData = {
                    "tokens": [
                        config.tokenA,
                        config.tokenB
                    ]
                };
                fs.writeFileSync(tokensPath,JSON.stringify(tokensData,null,2));
                console.log(`Created tokens.json at ${tokensPath}`);
            }

            // Start the bot
            spinner.text = "Starting bot...";
            spinner.start();
            require("./bot/index.js");
        } catch(error) {
            spinner.fail(`Failed to load configuration: ${error.message}`);
            console.error('Configuration error details:',error);
            process.exit(1);
        }
    }
};

main();