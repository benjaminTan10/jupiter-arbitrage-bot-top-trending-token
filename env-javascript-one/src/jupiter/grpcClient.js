const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// Path to your proto file - you may need to adjust this
const PROTO_PATH = path.resolve(__dirname, '../protos/jupiter.proto');

// If the proto file doesn't exist yet, we'll provide instructions
if (!fs.existsSync(PROTO_PATH)) {
  console.error(`
    Jupiter Proto file not found at ${PROTO_PATH}
    You need to:
    1. Get the proto definition from Jupiter
    2. Save it to ${PROTO_PATH}
    3. Run this script again
  `);
}

class JupiterGrpcClient extends EventEmitter {
  constructor(serverAddress = 'api.jup.ag:443') {
    super();
    this.serverAddress = serverAddress;
    this.client = null;
    this.subscriptions = new Map();
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    try {
      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      
      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      
      // Update with the correct package name from the proto file
      this.client = new protoDescriptor.jupiter.JupiterService(
        this.serverAddress,
        grpc.credentials.createSsl()
      );
      
      this.connected = true;
      this.emit('connected');
      console.log('Connected to Jupiter gRPC service');
    } catch (error) {
      console.error('Failed to connect to Jupiter gRPC service:', error);
      throw error;
    }
  }

  /**
   * Subscribe to token price updates
   * @param {string} tokenMint - Token mint address
   * @param {function} callback - Callback function for price updates
   * @returns {string} - Subscription ID
   */
  subscribeToToken(tokenMint, callback) {
    if (!this.connected) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    // This is an example - update the method name based on the actual proto definition
    const stream = this.client.subscribeToPrice({
      tokenMint: tokenMint
    });

    stream.on('data', (data) => {
      callback(data);
      this.emit('priceUpdate', { tokenMint, data });
    });

    stream.on('error', (error) => {
      console.error(`Subscription error for token ${tokenMint}:`, error);
      this.emit('error', { tokenMint, error });
    });

    stream.on('end', () => {
      console.log(`Subscription ended for token ${tokenMint}`);
      this.subscriptions.delete(subscriptionId);
      this.emit('subscriptionEnded', { tokenMint, subscriptionId });
    });

    this.subscriptions.set(subscriptionId, { stream, tokenMint });
    return subscriptionId;
  }

  /**
   * Unsubscribe from token price updates
   * @param {string} subscriptionId - The subscription ID to cancel
   */
  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.stream.cancel();
      this.subscriptions.delete(subscriptionId);
      console.log(`Unsubscribed from token ${subscription.tokenMint}`);
    }
  }

  /**
   * Close all subscriptions and disconnect
   */
  disconnect() {
    for (const [id, subscription] of this.subscriptions.entries()) {
      subscription.stream.cancel();
      this.subscriptions.delete(id);
    }
    
    this.connected = false;
    this.emit('disconnected');
    console.log('Disconnected from Jupiter gRPC service');
  }
}

module.exports = JupiterGrpcClient; 