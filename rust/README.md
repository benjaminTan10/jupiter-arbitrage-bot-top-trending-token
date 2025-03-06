# Solana Jupiter Arbitrage Bot

A Rust implementation of an arbitrage bot for the Solana blockchain using Jupiter Aggregator.

## Features

- Automatically finds arbitrage opportunities between token pairs
- Executes trades when profitable opportunities are found
- Configurable minimum profit percentage, trade size, and slippage
- Supports multiple base and quote tokens
- Integrates with Jupiter V6 API for best swap prices

## Prerequisites

- Rust 1.70.0 or higher
- Solana CLI tools
- A Solana wallet with funds

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/solana-jupiter-bot-rust.git
   cd solana-jupiter-bot-rust
   ```

2. Build the project:
   ```
   cargo build --release
   ```

## Configuration

1. Create a `config.json` file with your settings:
   ```json
   {
     "rpc_url": "https://api.mainnet-beta.solana.com",
     "wallet_path": "path/to/your/wallet.json",
     "min_profit_percent": 0.5,
     "interval_ms": 5000,
     "slippage_bps": 100,
     "base_amount_ui": 1.0,
     "base_tokens": [
       "So11111111111111111111111111111111111111112"
     ],
     "quote_tokens": [
       "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
       "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZXnKzLf"
     ]
   }
   ```

2. Create or use an existing Solana wallet:
   ```
   solana-keygen new -o wallet.json
   ```

## Usage

### Running the bot

```
./target/release/solana-jupiter-bot run --config config.json
```

### Viewing trending tokens

```
./target/release/solana-jupiter-bot trending --limit 10
```

## How It Works

1. The bot connects to Jupiter's API to get real-time prices
2. It checks for price differences between token pairs that can be profitably exploited
3. When a profitable opportunity is found, it:
   - Executes the first swap (base → quote token)
   - Waits for confirmation
   - Executes the second swap (quote → base token)
4. Profit is calculated after transaction fees and slippage

## Disclaimer

Trading cryptocurrencies involves significant risk and can result in the loss of your invested capital. This bot is provided for educational purposes only and should not be used for actual trading without thorough testing and validation.

## License

MIT
