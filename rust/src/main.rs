mod api;
mod arbitrage;
mod config;
mod models;
mod utils;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use dotenv::dotenv;
use jupiter_swap_api_client::JupiterSwapApiClient;
use solana_sdk::signature::Keypair;

#[derive(Parser)]
#[command(name = "solana-jupiter-bot")]
#[command(about = "A Solana Jupiter Arbitrage Bot", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the arbitrage bot
    Run {
        /// Path to config file
        #[arg(short, long, default_value = "config.json")]
        config: String,
    },
    /// List trending tokens
    Trending {
        /// Number of tokens to display
        #[arg(short, long, default_value_t = 10)]
        limit: usize,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env file if present
    dotenv().ok();
    
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    // Parse command line arguments
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Run { config } => {
            run_bot(&config).await?;
        },
        Commands::Trending { limit } => {
            list_trending_tokens(limit).await?;
        },
    }
    
    Ok(())
}

async fn run_bot(config_path: &str) -> Result<()> {
    // Load configuration
    let config = config::load_config(config_path)
        .context("Failed to load configuration")?;
    
    // Initialize Jupiter client
    let jupiter_client = JupiterSwapApiClient::new("https://quote-api.jup.ag/v6".to_string());
    
    // Load wallet
    let wallet = config::load_wallet(&config.wallet_path)
        .context("Failed to load wallet")?;
    
    // Resolve tokens
    let base_tokens = config::resolve_tokens(config.base_tokens).await?;
    let quote_tokens = config::resolve_tokens(config.quote_tokens).await?;
    
    // Calculate base amount from UI amount
    let base_amount = if !base_tokens.is_empty() {
        let base_token = &base_tokens[0];
        utils::ui_to_amount(config.base_amount_ui, base_token.decimals)
    } else {
        1_000_000_000 // Default to 1 SOL if no base tokens
    };
    
    // Run the bot
    arbitrage::run_bot(
        wallet,
        jupiter_client,
        base_tokens,
        quote_tokens,
        base_amount,
        config.min_profit_percent,
        config.slippage_bps,
        config.interval_ms,
    ).await?;
    
    Ok(())
}

async fn list_trending_tokens(limit: usize) -> Result<()> {
    let tokens = api::token::get_trending_tokens(limit).await?;
    
    println!("Top {} trending tokens:", limit);
    println!("{:<10} {:<20} {:<44} {:<10} {:<15} {:<15}", 
             "Symbol", "Name", "Address", "Decimals", "Volume (24h)", "Price Change");
    
    for token in tokens {
        println!("{:<10} {:<20} {:<44} {:<10} {:<15} {:<15}", 
                 token.symbol,
                 token.name,
                 token.address.to_string(),
                 token.decimals,
                 token.volume_24h.map_or("N/A".to_string(), |v| format!("${:.2}", v)),
                 token.price_change_24h.map_or("N/A".to_string(), |p| format!("{:.2}%", p)));
    }
    
    Ok(())
} 