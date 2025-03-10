const axios = require('axios');

/**
 * A simplified connection class that uses HTTP requests instead of WebSockets
 * to interact with Solana
 */
class RestConnection {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.commitment = 'confirmed';
  }

  async getRecentBlockhash() {
    const response = await this._sendRequest('getRecentBlockhash', [this.commitment]);
    return response.result;
  }

  async getBalance(publicKey) {
    const response = await this._sendRequest('getBalance', [publicKey.toString()]);
    return response.result.value;
  }

  async getParsedTokenAccountsByOwner(publicKey, filter) {
    let params = [
      publicKey.toString(),
      filter,
      { encoding: 'jsonParsed' }
    ];
    const response = await this._sendRequest('getTokenAccountsByOwner', params);
    return response.result;
  }
  
  async sendRawTransaction(rawTransaction, options = {}) {
    const params = [
      rawTransaction.toString('base64'),
      { 
        skipPreflight: options.skipPreflight || false,
        preflightCommitment: options.preflightCommitment || this.commitment
      }
    ];
    const response = await this._sendRequest('sendTransaction', params);
    return response.result;
  }
  
  async getBlockHeight() {
    const response = await this._sendRequest('getBlockHeight', []);
    return response.result;
  }

  async _sendRequest(method, params) {
    try {
      const response = await axios.post(this.endpoint, {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      });
      return response.data;
    } catch (error) {
      console.error(`Error in ${method}:`, error.message);
      throw error;
    }
  }
}

module.exports = { Connection: RestConnection }; 