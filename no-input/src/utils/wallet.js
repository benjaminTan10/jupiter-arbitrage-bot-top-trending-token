const { Keypair, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

/**
 * Utility functions for wallet operations
 */

/**
 * Initialize a wallet from a private key
 * @param {string} privateKey - The private key
 * @returns {Object} The wallet object
 */
function initializeWallet(privateKey) {
  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    return wallet;
  } catch (error) {
    console.error('Error initializing wallet:', error);
    throw new Error('Invalid private key format');
  }
}

/**
 * Get the balance of a wallet
 * @param {Object} wallet - The wallet object
 * @param {Connection} connection - The RPC connection
 * @returns {Promise<number>} The balance in SOL
 */
async function getWalletBalance(wallet, connection) {
  try {
    const balance = await connection.getBalance(wallet.publicKey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw error;
  }
}

/**
 * Get token balances for a wallet
 * @param {Object} wallet - The wallet object
 * @param {Connection} connection - The RPC connection
 * @param {string} tokenMint - The token mint address (optional)
 * @returns {Promise<Object>} Object with token balances
 */
async function getTokenBalances(wallet, connection, tokenMint = null) {
  try {
    const balances = {};
    
    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet.publicKey,
      tokenMint ? { mint: new PublicKey(tokenMint) } : {}
    );
    
    // Process each token account
    for (const { account, pubkey } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const mint = parsedInfo.mint;
      const amount = parsedInfo.tokenAmount.uiAmount;
      
      if (amount > 0) {
        balances[mint] = amount;
      }
    }
    
    return balances;
  } catch (error) {
    console.error('Error getting token balances:', error);
    throw error;
  }
}

module.exports = {
  initializeWallet,
  getWalletBalance,
  getTokenBalances
}; 