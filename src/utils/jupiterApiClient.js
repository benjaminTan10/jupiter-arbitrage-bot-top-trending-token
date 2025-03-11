const {createJupiterApiClient} = require('@jup-ag/api');
const {Connection,Keypair,PublicKey,Transaction,VersionedTransaction,SendOptions} = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const ora = require('ora-classic');
const axios = require('axios');

// Configure Jupiter API client
const jupiterQuoteApi = createJupiterApiClient();

// Direct fetch function as fallback when client fails
const fetchQuoteDirectly = async (inputMint,outputMint,amount,slippageBps) => {
    try {
        console.log(chalk.cyan(`Fetching quote via direct API: ${inputMint.substring(0,6)}... → ${outputMint.substring(0,6)}... Amount: ${amount}`));

        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;

        const response = await axios.get(url);
        return response.data;
    } catch(error) {
        console.error(chalk.red('Direct API quote error:'),error.response?.data || error.message);
        throw error;
    }
};

/**
 * Get a quote for swapping tokens
 * @param {string} inputMint - The mint address of the input token
 * @param {string} outputMint - The mint address of the output token
 * @param {number|string} amount - The amount of input token (in the smallest unit)
 * @param {number} slippageBps - Slippage tolerance in basis points (e.g., 100 = 1%)
 * @returns {Promise<Object>} - Quote information
 */
const getQuote = async (inputMint,outputMint,amount,slippageBps = 100) => {
    try {
        // Convert amount to string if it's not already
        const amountStr = amount.toString();

        console.log(chalk.cyan(`Fetching quote: ${inputMint.substring(0,6)}... → ${outputMint.substring(0,6)}... Amount: ${amountStr}`));

        let quoteResponse;
        // First try with the Jupiter API client
        try {
            quoteResponse = await jupiterQuoteApi.quoteGet({
                inputMint,
                outputMint,
                amount: amountStr,
                slippageBps,
                onlyDirectRoutes: false,
                restrictIntermediateTokens: true, // This is important for stability
            });
        } catch(clientError) {
            console.log(chalk.yellow(`Jupiter client API failed, trying direct API call: ${clientError.message}`));

            // If same token (arbitrage), try fetching with an intermediate token (USDC)
            if(inputMint === outputMint) {
                console.log(chalk.cyan("Using intermediate token for same-token arbitrage"));
                // USDC address
                const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

                // Get quote for input → USDC
                const firstLegQuote = await fetchQuoteDirectly(inputMint,usdcMint,amountStr,slippageBps);

                if(!firstLegQuote || !firstLegQuote.outAmount) {
                    throw new Error("Failed to get first leg quote (token → USDC)");
                }

                // Get quote for USDC → output
                const secondLegQuote = await fetchQuoteDirectly(usdcMint,outputMint,firstLegQuote.outAmount,slippageBps);

                if(!secondLegQuote || !secondLegQuote.outAmount) {
                    throw new Error("Failed to get second leg quote (USDC → token)");
                }

                // Create a combined quote
                quoteResponse = {
                    inputMint,
                    inAmount: amountStr,
                    outputMint,
                    outAmount: secondLegQuote.outAmount,
                    otherAmountThreshold: secondLegQuote.otherAmountThreshold,
                    swapMode: "ExactIn",
                    slippageBps,
                    priceImpactPct: (parseFloat(firstLegQuote.priceImpactPct || "0") +
                        parseFloat(secondLegQuote.priceImpactPct || "0")).toString(),
                    routePlan: [
                        ...(firstLegQuote.routePlan || []),
                        ...(secondLegQuote.routePlan || [])
                    ]
                };
            } else {
                // For different tokens, just try direct API call
                quoteResponse = await fetchQuoteDirectly(inputMint,outputMint,amountStr,slippageBps);
            }
        }

        if(quoteResponse) {
            const inAmount = quoteResponse.inAmount;
            const outAmount = quoteResponse.outAmount;
            const priceImpact = (parseFloat(quoteResponse.priceImpactPct) * 100).toFixed(4);

            console.log(chalk.green(`Quote received: In: ${inAmount}, Out: ${outAmount}, Impact: ${priceImpact}%`));

            // Calculate profit for arbitrage (if same token)
            if(inputMint === outputMint) {
                const startAmount = BigInt(inAmount);
                const endAmount = BigInt(outAmount);
                const profitAmount = endAmount > startAmount ? endAmount - startAmount : BigInt(0);
                const profitPercentage = startAmount > 0 ?
                    Number(profitAmount * BigInt(10000) / startAmount) / 100 : 0;

                if(profitPercentage > 0) {
                    console.log(chalk.green(`✅ ARBITRAGE OPPORTUNITY: ${profitPercentage.toFixed(4)}% profit`));
                } else {
                    console.log(chalk.red(`❌ No arbitrage opportunity: ${profitPercentage.toFixed(4)}% (negative or zero profit)`));
                }
            }

            // Log route plan if available
            if(quoteResponse.routePlan && quoteResponse.routePlan.length > 0) {
                console.log(chalk.yellow('Route plan:'));
                quoteResponse.routePlan.forEach((step,idx) => {
                    const ammName = step.swapInfo?.label || 'Unknown';
                    console.log(chalk.gray(`  ${idx + 1}. ${ammName} - In: ${step.swapInfo?.inAmount || 'unknown'} → Out: ${step.swapInfo?.outAmount || 'unknown'}`));
                });
            }
        }

        return quoteResponse;
    } catch(error) {
        console.error(chalk.red('Error getting Jupiter quote:'),error.message);
        throw error;
    }
};

/**
 * Get a swap transaction
 * @param {Object} quoteResponse - The quote response from getQuote
 * @param {string} userPublicKey - The user's wallet public key
 * @returns {Promise<Object>} - Swap transaction data
 */
const getSwapTransaction = async (quoteResponse,userPublicKey) => {
    try {
        console.log(chalk.cyan(`Creating swap transaction for user: ${userPublicKey.substring(0,6)}...`));

        // Prepare swap transaction request
        const swapRequest = {
            quoteResponse,
            userPublicKey,
            wrapUnwrapSOL: true,
        };

        // Get swap transaction from Jupiter API
        const swapTransactionResponse = await jupiterQuoteApi.swapPost(swapRequest);

        console.log(chalk.green('Swap transaction created successfully'));
        return swapTransactionResponse;
    } catch(error) {
        console.error(chalk.red('Error getting swap transaction:'),error.message);
        throw error;
    }
};

/**
 * Execute a swap transaction
 * @param {Object} swapTransactionResponse - The response from getSwapTransaction
 * @param {Connection} connection - Solana connection
 * @param {Keypair} wallet - The user's wallet keypair
 * @returns {Promise<Object>} - Transaction result
 */
const executeSwap = async (swapTransactionResponse,connection,wallet) => {
    try {
        console.log(chalk.yellow('Executing swap transaction...'));

        const txid = swapTransactionResponse.swapTransaction;
        const rawTransaction = Buffer.from(txid,'base64');

        // Determine if it's a legacy or versioned transaction
        const isVersionedTransaction = rawTransaction[0] === 0x80;
        console.log(chalk.gray(`Transaction type: ${isVersionedTransaction ? 'Versioned' : 'Legacy'}`));

        let transaction;
        if(isVersionedTransaction) {
            // Deserialize versioned transaction
            transaction = VersionedTransaction.deserialize(rawTransaction);
        } else {
            // Deserialize legacy transaction
            transaction = Transaction.from(rawTransaction);
        }

        // Sign and send the transaction
        if(isVersionedTransaction) {
            transaction.sign([wallet]);
        } else {
            transaction.partialSign(wallet);
        }

        // Send the transaction
        const sendOptions = {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        };

        console.log(chalk.yellow('Sending transaction to blockchain...'));
        const signature = await connection.sendRawTransaction(
            transaction.serialize(),
            sendOptions
        );

        console.log(chalk.green(`Transaction sent with signature: ${signature}`));

        // Wait for confirmation
        console.log(chalk.yellow('Waiting for confirmation...'));
        const confirmationResponse = await connection.confirmTransaction(signature,'confirmed');

        const success = confirmationResponse?.value?.err === null;
        if(success) {
            console.log(chalk.green('Transaction confirmed successfully!'));
        } else {
            console.log(chalk.red(`Transaction failed: ${JSON.stringify(confirmationResponse?.value?.err)}`));
        }

        return {
            signature,
            confirmationResponse,
            success: success,
        };
    } catch(error) {
        console.error(chalk.red('Error executing swap:'),error.message);
        throw error;
    }
};

/**
 * Get all quotes to check for arbitrage opportunities
 * @param {string} tokenAMint - Token A mint address
 * @param {string} tokenBMint - Token B mint address
 * @param {number|string} amount - Trade amount
 * @returns {Promise<Object>} - Arbitrage opportunity details
 */
const checkArbitrageOpportunity = async (tokenAMint,tokenBMint,amount) => {
    try {
        console.log(chalk.cyan(`Checking arbitrage: ${tokenAMint.substring(0,6)}... ↔ ${tokenBMint.substring(0,6)}... Amount: ${amount}`));

        // Convert amount to string if it's not already
        const amountStr = amount.toString();

        // Get quote for A -> B
        console.log(chalk.gray('Getting forward quote (A→B)...'));
        const forwardQuote = await getQuote(tokenAMint,tokenBMint,amountStr,100);

        // Calculate the amount we would receive from A -> B
        const receivedAmount = forwardQuote.outAmount;
        console.log(chalk.gray(`Forward swap would yield: ${receivedAmount}`));

        // Get quote for B -> A with the amount we would receive
        console.log(chalk.gray('Getting reverse quote (B→A)...'));
        const reverseQuote = await getQuote(tokenBMint,tokenAMint,receivedAmount,100);

        // Calculate the final amount we would receive after the round trip
        const finalAmount = reverseQuote.outAmount;
        console.log(chalk.gray(`Reverse swap would yield: ${finalAmount}`));

        // Calculate profit percentage
        const startAmount = BigInt(amountStr);
        const endAmount = BigInt(finalAmount);
        const profitAmount = endAmount - startAmount;
        const profitPercentage = Number(profitAmount * BigInt(10000) / startAmount) / 100;

        const hasOpportunity = profitPercentage > 0;

        if(hasOpportunity) {
            console.log(chalk.green(`✅ ARBITRAGE OPPORTUNITY FOUND: ${profitPercentage.toFixed(4)}% profit`));
        } else {
            console.log(chalk.red(`❌ No arbitrage opportunity: ${profitPercentage.toFixed(4)}% profit`));
        }

        return {
            startAmount: amountStr,
            receivedAmount,
            finalAmount,
            profitAmount: profitAmount.toString(),
            profitPercentage,
            hasOpportunity,
            forwardQuote,
            reverseQuote
        };
    } catch(error) {
        console.error(chalk.red('Error checking arbitrage opportunity:'),error.message);
        return {
            hasOpportunity: false,
            error: error.message
        };
    }
};

/**
 * Complete trade (quote, swap transaction, execute) in one function
 * @param {string} inputMint - Input token mint
 * @param {string} outputMint - Output token mint
 * @param {number|string} amount - Trade amount
 * @param {Connection} connection - Solana connection
 * @param {Keypair} wallet - User's wallet keypair
 * @param {number} slippageBps - Slippage tolerance in basis points
 * @returns {Promise<Object>} - Trade result
 */
const completeTrade = async (inputMint,outputMint,amount,connection,wallet,slippageBps = 100) => {
    const spinner = ora({
        text: 'Getting Jupiter quote...',
        color: 'cyan',
    }).start();

    try {
        // Get quote
        const quote = await getQuote(inputMint,outputMint,amount,slippageBps);
        spinner.text = 'Creating swap transaction...';

        // Get swap transaction
        const swapTransactionResponse = await getSwapTransaction(quote,wallet.publicKey.toString());
        spinner.text = 'Executing swap...';

        // Execute swap
        const swapResult = await executeSwap(swapTransactionResponse,connection,wallet);

        if(swapResult.success) {
            spinner.succeed(`Trade completed! Signature: ${swapResult.signature}`);
        } else {
            spinner.fail(`Trade failed with status: ${JSON.stringify(swapResult.confirmationResponse?.value?.err)}`);
        }

        return {
            quote,
            swapTransactionResponse,
            swapResult,
        };
    } catch(error) {
        spinner.fail(`Trade failed: ${error.message}`);
        throw error;
    }
};

module.exports = {
    jupiterQuoteApi,
    getQuote,
    getSwapTransaction,
    executeSwap,
    checkArbitrageOpportunity,
    completeTrade
}; 