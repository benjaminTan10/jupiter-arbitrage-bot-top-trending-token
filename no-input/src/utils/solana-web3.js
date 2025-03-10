const bs58 = require('bs58');

class PublicKey {
  constructor(value) {
    if (typeof value === 'string') {
      // Validate base58 string format
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
        throw new Error('Invalid public key format');
      }
      this._bn = value;
    } else if (value instanceof Uint8Array) {
      this._bn = bs58.encode(value);
    } else if (value instanceof PublicKey) {
      this._bn = value.toString();
    } else {
      throw new Error('Invalid public key input');
    }
  }

  equals(publicKey) {
    return this.toString() === publicKey.toString();
  }

  toBytes() {
    return bs58.decode(this._bn);
  }

  toString() {
    return this._bn;
  }

  toBase58() {
    return this._bn;
  }
}

class Keypair {
  constructor(keypair) {
    this._keypair = keypair || { publicKey: null, secretKey: null };
  }

  static fromSecretKey(secretKey) {
    if (!(secretKey instanceof Uint8Array)) {
      throw new Error('Secret key must be an Uint8Array');
    }

    // In a real implementation, we'd derive the public key from the secret key
    // For simplicity, we'll just take the first 32 bytes as the "public key"
    const publicKeyBytes = secretKey.slice(0, 32);
    const publicKey = new PublicKey(publicKeyBytes);

    return new Keypair({
      publicKey,
      secretKey
    });
  }

  get publicKey() {
    return this._keypair.publicKey;
  }

  get secretKey() {
    return this._keypair.secretKey;
  }
}

class Transaction {
  constructor() {
    this.signatures = [];
    this._serialized = null;
  }

  static from(buffer) {
    // Create a dummy transaction that can be signed
    const tx = new Transaction();
    tx._serialized = buffer;
    return tx;
  }

  partialSign(keypair) {
    // Add signature to the transaction
    this.signatures.push({
      publicKey: keypair.publicKey,
      signature: null // In a real implementation this would be the actual signature
    });
  }

  serialize() {
    // Return the already serialized transaction
    return this._serialized;
  }
}

module.exports = {
  PublicKey,
  Keypair,
  Transaction
}; 