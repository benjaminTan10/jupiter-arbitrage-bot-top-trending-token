require("dotenv").config();
const {Connection,PublicKey} = require("@solana/web3.js");
const {setTimeout} = require("timers/promises");
const cache = require("../bot/cache");

// Adding a backup option for the transaction lookup
// This is only needed for some RPCS that are not 
// working or are behind at the time of lookup.
const rpc_main = process.env.DEFAULT_RPC;
const rpc_backup = 'https://api.mainnet-beta.solana.com';

// Key variables
var transstatus = 0;
var transid = '';
var transresp = [];

const WAIT_ERROR_CODE = 1;
const WAIT_SUCCESS_CODE = 0;

const waitabit = async (ms) => {
    try {
        await setTimeout(ms);
        console.log('Waited for',ms,'milliseconds.');
        return WAIT_SUCCESS_CODE;
    } catch(error) {
        console.error('Error occurred while waiting:',error);
        return WAIT_ERROR_CODE;
    }
};

// Main RPC
const connection = new Connection(rpc_main,{
    disableRetryOnRateLimit: true,
    commitment: 'confirmed',
});

// Backup RPC
const connection_backup = new Connection(rpc_backup,{
    disableRetryOnRateLimit: false,
    commitment: 'confirmed',
});

const fetchTransaction = async (rpcConnection,transaction) => {
    try {
        return await rpcConnection.getParsedTransaction(transaction,{"maxSupportedTransactionVersion": 0});
    } catch(error) {
        // Handle errors, or let the caller handle them.
        console.error("Error fetching transaction:",error);
        return null;
    }
};

const checkTransactionStatus = async (transaction,wallet_address) => {
    try {
        // Try to fetch the transaction from the main RPC
        transstatus = 2;
        transresp = await fetchTransaction(connection,transaction);

        // If the transaction is not found on the main RPC, try the backup RPC
        if(!transresp) {
            transresp = await fetchTransaction(connection_backup,transaction);
        }

        if(transresp) {
            if(transresp.meta) {
                if(transresp.meta.err) {
                    transstatus = 2;
                    return [transresp.meta.err,WAIT_ERROR_CODE];
                } else {
                    transstatus = 1;
                }
            } else {
                transstatus = 0;
            }
            return [transresp,WAIT_SUCCESS_CODE];
        } else {
            return [null,WAIT_ERROR_CODE];
        }
    } catch(error) {
        console.error('Error checking transaction status:',error);
        return [null,WAIT_ERROR_CODE];
    }
};

const checktrans = async (transaction_id,wallet_address,tokenA) => {
    try {
        const [result,err] = await checkTransactionStatus(transaction_id,wallet_address);
        if(err === WAIT_SUCCESS_CODE && result) {
            transresp = result;

            // Translate all the transactions into easy to read data
            const transaction_changes = {};
            let tokenamt = 0;
            let tokendec = 0;

            if(transresp.meta?.innerInstructions) {
                for(const innerInstruction of transresp.meta.innerInstructions) {
                    if(innerInstruction?.instructions) {
                        for(const instruction of innerInstruction.instructions) {
                            const parsed = instruction?.parsed;

                            //console.log(JSON.stringify(parsed, null, 4));
                            if(parsed?.parsed) {
                                if(parsed.parsed.type == 'transferChecked') {
                                    if(parsed.parsed.info.authority == wallet_address && parsed.parsed.info.mint == 'So11111111111111111111111111111111111111112') {
                                        tokenamt = Number(parsed.parsed.info.tokenAmount.amount);
                                        tokendec = parsed.parsed.info.tokenAmount.decimals;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // SOL Transfer handling
            if(tokenamt > 0) {
                transaction_changes['So11111111111111111111111111111111111111112'] = {status: transstatus,start: tokenamt,decimals: tokendec,end: 0,change: (-1 * tokenamt)};
            }

            // Pre Token Balance Handling
            for(token of transresp.meta.preTokenBalances) {
                if(token.owner == wallet_address) {
                    transaction_changes[token.mint.toString()] = {status: transstatus,start: token.uiTokenAmount.amount,decimals: token.uiTokenAmount.decimals};
                };
            }

            // Post Token Handling
            for(token of transresp.meta.postTokenBalances) {
                if(token.owner == wallet_address) {
                    if(transaction_changes[token.mint]?.start) {
                        // Case where token account existed already
                        diff = Number(token.uiTokenAmount.amount) - Number(transaction_changes[token.mint].start);
                        diffdec = toDecimal(diff,transaction_changes[token.mint].decimals);
                        transaction_changes[token.mint] = {...transaction_changes[token.mint],end: token.uiTokenAmount.amount,change: diff}
                    } else {
                        // Case where token did not exist yet
                        // Set the initial to 0
                        transaction_changes[token.mint] = {status: transstatus,start: 0,decimals: token.uiTokenAmount.decimals};
                        // Calculate the difference
                        diff = Number(token.uiTokenAmount.amount) - Number(transaction_changes[token.mint].start);
                        diffdec = toDecimal(diff,transaction_changes[token.mint].decimals);
                        transaction_changes[token.mint] = {...transaction_changes[token.mint],end: token.uiTokenAmount.amount,change: diff}
                    }
                }
            }
            return [transaction_changes,WAIT_SUCCESS_CODE];
        } else {
            // Transaction not found or error occurred
            return [null,WAIT_ERROR_CODE];
        }
    } catch(error) {
        console.error('Error checking transaction:',error);
        return [null,WAIT_ERROR_CODE];
    }
}

// Helper function for decimal conversion
const toDecimal = (number,decimals) =>
    parseFloat(String(number) / 10 ** decimals).toFixed(decimals);

module.exports = {checktrans};