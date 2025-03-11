const getInitialotherAmountThreshold = async (
    jupiter,
    inputToken,
    outputToken,
    amountToTrade
) => {
    let spinner;
    try {
        const tokenDecimals = cache.sideBuy ? inputToken.decimals : outputToken.decimals;
        const spinnerText = `Computing routes for the token with amountToTrade ${amountToTrade} with decimals ${tokenDecimals}`;

        spinner = ora({
            text: spinnerText,
            discardStdin: false,
            color: "magenta",
        }).start();

        //JSBI AMT to TRADE
        const amountInBN = new BN(amountToTrade);

        // compute routes with safer options
        const routes = await jupiter.computeRoutes({
            inputMint: new PublicKey(inputToken.address),
            outputMint: new PublicKey(outputToken.address),
            amount: amountInJSBI,
            slippageBps: 0,
            forceFetch: true,
            // Enable direct routes only to avoid complex routing that might fail
            onlyDirectRoutes: true,
            filterTopNResult: 1,
            // Avoid intermediate tokens that might cause issues
            excludeDexes: ['Raydium CLMM','Invariant','Aldrin','Crema'],
        });

        if(routes?.routesInfos?.length > 0) {
            spinner.succeed("Routes computed!");
            return routes.routesInfos[0].otherAmountThreshold;
        } else {
            // Try again with non-direct routes if no direct routes found
            spinner.info("No direct routes found, attempting with all routes...");

            const allRoutes = await jupiter.computeRoutes({
                inputMint: new PublicKey(inputToken.address),
                outputMint: new PublicKey(outputToken.address),
                amount: amountInJSBI,
                slippageBps: 0,
                forceFetch: true,
                // Try without restricting to direct routes
                onlyDirectRoutes: false,
                filterTopNResult: 1,
                // Still exclude problematic DEXes
                excludeDexes: ['Raydium CLMM','Invariant','Aldrin','Crema'],
            });

            if(allRoutes?.routesInfos?.length > 0) {
                spinner.succeed("Alternative routes computed!");
                return allRoutes.routesInfos[0].otherAmountThreshold;
            }

            spinner.fail("No routes found. Something is wrong! Check tokens:" + inputToken.address + " " + outputToken.address);
            console.error(chalk.red("No routes found between these tokens. This could be due to:"));
            console.error(chalk.yellow("1. Insufficient liquidity between the token pair"));
            console.error(chalk.yellow("2. Invalid token address configuration"));
            console.error(chalk.yellow("3. RPC issues or network congestion"));
            process.exit(1);
        }
    } catch(error) {
        if(spinner)
            spinner.fail(chalk.bold.redBright("Computing routes failed!\n"));
        console.error(chalk.red("Error computing routes:"),error.message);
        console.error(chalk.yellow("This could be due to RPC issues, insufficient liquidity, or invalid token configuration"));
        logExit(1,error);
        process.exitCode = 1;
        process.exit(1);
    }
}; 