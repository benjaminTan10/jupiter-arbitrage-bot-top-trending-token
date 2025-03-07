# Troubleshooting Guide for Solana Jupiter Bot

## Common Issues and Solutions

### "Assertion Failed" Error During Jupiter Initialization

If you encounter this error:
```
ERROR: Assertion failed
Error: Assertion failed
    at assert (node_modules\bn.js\lib\bn.js:6:21)
    at BN.iushrn (node_modules\bn.js\lib\bn.js:2100:5)
    // ... more error lines
```

**Solutions**:

1. **Try the Fallback Configuration**
   - The bot now automatically tries a fallback configuration that excludes problematic AMMs

2. **Manually Exclude AMMs**
   - Edit your config.json and add:
   ```json
   "ammsToExclude": ["Raydium CLMM", "Orca (Whirlpools)"]
   ```

3. **Update Dependencies**
   - If errors persist, try reinstalling with fixed versions:
   ```bash
   npm ci --force
   # or
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Check Node.js Version**
   - Make sure you're using Node.js version 16 or higher:
   ```bash
   node --version
   ```
   If using an older version, upgrade Node.js.

### Missing Token Error

If you see "Token information not found" errors:

**Solutions**:

1. **Run the Wizard**
   ```bash
   npm run wizard
   ```

2. **Manually Create Token Files**
   - The bot now automatically creates default token files.
   - If issues persist, check that the temp directory exists and contains tokens.json.

3. **Use Direct Configuration**
   - The bot will now try to use tokens from config.json if tokens.json is missing.

### Connection Error

If you encounter RPC connection errors:

**Solutions**:

1. **Try Different RPC Endpoints**
   - The default public endpoints often have rate limits or may be unreliable.
   - Consider using a paid RPC provider like QuickNode, Alchemy, or Ankr.

2. **Check Your Internet Connection**
   - Ensure you have a stable internet connection.

3. **Adjust Timing Settings**
   - Increase MIN_INTERVAL_MS in your .env file to reduce requests per minute. 