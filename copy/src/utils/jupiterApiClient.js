const {createJupiterApiClient} = require('@jup-ag/api');
const {Connection,Keypair,PublicKey,Transaction,VersionedTransaction,SendOptions} = require('@solana/web3.js');
const bs58 = require('bs58');
const chalk = require('chalk');
const JSBI = require('jsbi');
const ora = require('ora-classic');

// Configure Jupiter API client
const jupiterQuoteApi = createJupiterApiClient();

/**
 * Get a quote for swapping tokens
 * @param {string} inputMint - The mint address of the input token
 * @param {string} outputMint - The mint address of the output token
 * @param {number|string} amount - The amount of input token (in the smallest unit)
 * @param {number} slippageBps - Slippage tolerance in basis points (e.g., 100 = 1%)
 * @returns {Promise<Object>} - Quote information
 */
const getQuote = async (inputMint, outputMint, amount, slippageBps = 100) => {
    try {
        // Convert amount to string if it's not already
        const amountStr = amount.toString();
        
        // Get quote from Jupiter API
        const quoteResponse = await jupiterQuoteApi.quoteGet({
            inputMint,
            outputMint,
            amount: amountStr,
            slippageBps,
            onlyDirectRoutes: false,
            asLegacyTransaction: false,
        });
        
        return quoteResponse;
    } catch (error) {
        console.error(chalk.red('Error getting Jupiter quote:'), error.message);
        throw error;
    }
};

/**
 * Get a swap transaction
 * @param {Object} quoteResponse - The quote response from getQuote
 * @param {string} userPublicKey - The user's wallet public key
 * @returns {Promise<Object>} - Swap transaction data
 */
const getSwapTransaction = async (quoteResponse, userPublicKey) => {
    try {
        // Prepare swap transaction request
        const swapRequest = {
            quoteResponse,
            userPublicKey,
            wrapUnwrapSOL: true,
        };
        
        // Get swap transaction from Jupiter API
        const swapTransactionResponse = await jupiterQuoteApi.swapPost(swapRequest);
        
        return swapTransactionResponse;
    } catch (error) {
        console.error(chalk.red('Error getting swap transaction:'), error.message);
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
const executeSwap = async (swapTransactionResponse, connection, wallet) => {
    try {
        const txid = swapTransactionResponse.swapTransaction;
        const rawTransaction = Buffer.from(txid, 'base64');
        
        // Determine if it's a legacy or versioned transaction
        const isVersionedTransaction = rawTransaction[0] === 0x80;
        
        let transaction;
        if (isVersionedTransaction) {
            // Deserialize versioned transaction
            transaction = VersionedTransaction.deserialize(rawTransaction);
        } else {
            // Deserialize legacy transaction
            transaction = Transaction.from(rawTransaction);
        }
        
        // Sign and send the transaction
        if (isVersionedTransaction) {
            transaction.sign([wallet]);
        } else {
            transaction.partialSign(wallet);
        }
        
        // Send the transaction
        const sendOptions = {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        };
        
        const signature = await connection.sendRawTransaction(
            transaction.serialize(),
            sendOptions
        );
        
        // Wait for confirmation
        const confirmationResponse = await connection.confirmTransaction(signature, 'confirmed');
        
        return {
            signature,
            confirmationResponse,
            success: confirmationResponse?.value?.err === null,
        };
    } catch (error) {
        console.error(chalk.red('Error executing swap:'), error.message);
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
const checkArbitrageOpportunity = async (tokenAMint, tokenBMint, amount) => {
    try {
        // Convert amount to string if it's not already
        const amountStr = amount.toString();
        
        // Get quote for A -> B
        const forwardQuote = await getQuote(tokenAMint, tokenBMint, amountStr, 100);
        
        // Calculate the amount we would receive from A -> B
        const receivedAmount = forwardQuote.outAmount;
        
        // Get quote for B -> A with the amount we would receive
        const reverseQuote = await getQuote(tokenBMint, tokenAMint, receivedAmount, 100);
        
        // Calculate the final amount we would receive after the round trip
        const finalAmount = reverseQuote.outAmount;
        
        // Calculate profit percentage
        const startAmount = BigInt(amountStr);
        const endAmount = BigInt(finalAmount);
        const profitAmount = endAmount - startAmount;
        const profitPercentage = Number(profitAmount * BigInt(10000) / startAmount) / 100;
        
        return {
            startAmount: amountStr,
            receivedAmount,
            finalAmount,
            profitAmount: profitAmount.toString(),
            profitPercentage,
            hasOpportunity: profitPercentage > 0,
            forwardQuote,
            reverseQuote
        };
    } catch (error) {
        console.error(chalk.red('Error checking arbitrage opportunity:'), error.message);
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
const completeTrade = async (inputMint, outputMint, amount, connection, wallet, slippageBps = 100) => {
    const spinner = ora({
        text: 'Getting Jupiter quote...',
        color: 'cyan',
    }).start();
    
    try {
        // Get quote
        const quote = await getQuote(inputMint, outputMint, amount, slippageBps);
        spinner.text = 'Creating swap transaction...';
        
        // Get swap transaction
        const swapTransactionResponse = await getSwapTransaction(quote, wallet.publicKey.toString());
        spinner.text = 'Executing swap...';
        
        // Execute swap
        const swapResult = await executeSwap(swapTransactionResponse, connection, wallet);
        
        if (swapResult.success) {
            spinner.succeed(`Trade completed! Signature: ${swapResult.signature}`);
        } else {
            spinner.fail(`Trade failed with status: ${JSON.stringify(swapResult.confirmationResponse?.value?.err)}`);
        }
        
        return {
            quote,
            swapTransactionResponse,
            swapResult,
        };
    } catch (error) {
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