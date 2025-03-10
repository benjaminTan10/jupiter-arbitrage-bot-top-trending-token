const axios = require('axios');

class JupiterApi {
  constructor() {
    this.baseUrl = 'https://quote-api.jup.ag/v4';
  }

  async getQuote(inputMint, outputMint, amount, slippageBps = 50) {
    try {
      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
      throw error;
    }
  }

  async getSwapTransactions(route, userPublicKey) {
    try {
      const response = await axios.post(`${this.baseUrl}/swap`, {
        route,
        userPublicKey
      });
      return response.data;
    } catch (error) {
      console.error('Error getting swap instructions:', error);
      throw error;
    }
  }
}

module.exports = new JupiterApi(); 