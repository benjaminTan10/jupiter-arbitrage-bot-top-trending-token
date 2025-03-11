#!/usr/bin/env node
"use strict";
require("dotenv").config();
const chalk = require("chalk");
const ora = require("ora-classic");
const fs = require("fs");
const {checkForEnvFile,checkWallet,checkArbReady,createTempDir} = require("./utils");

// Create temp directory if it doesn't exist
createTempDir();

// Check for .env file
checkForEnvFile();

// Validate required environment variables
const requiredEnvVars = [
    "SOLANA_WALLET_PRIVATE_KEY",
    "DEFAULT_RPC"
];

let spinner = ora({
    text: "Checking environment variables...",
    discardStdin: false,
    color: "magenta",
}).start();

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if(missingVars.length > 0) {
    spinner.fail(`Missing required environment variables: ${missingVars.join(', ')}`);
    console.log(chalk.red("Please set these variables in your .env file and try again."));
    process.exit(1);
}

spinner.succeed("Environment variables verified!");

// Check wallet validity
checkWallet();

// Start the bot directly
console.clear();
console.log(chalk.bold.cyan("\n========== ARBITRAGE BOT ==========\n"));
console.log(chalk.yellow("Starting in arbitrage mode with environment configuration..."));

// Start the bot directly
require('./bot/index.js');