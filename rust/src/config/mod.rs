use anyhow::Result;
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Keypair};
use std::fs;
use std::path::Path;
use std::str::FromStr;

use crate::api::token::TokenInfo;
use crate::models::Config;

/// Load configuration from file
pub fn load_config<P: AsRef<Path>>(path: P) -> Result<Config> {
    let config_str = fs::read_to_string(path)?;
    let config: Config = serde_json::from_str(&config_str)?;
    Ok(config)
}

/// Load wallet keypair from file
pub fn load_wallet<P: AsRef<Path>>(path: P) -> Result<Keypair> {
    Ok(read_keypair_file(path)?)
}

/// Resolve token addresses to TokenInfo objects
pub async fn resolve_tokens(token_addresses: Vec<String>) -> Result<Vec<TokenInfo>> {
    let mut tokens = Vec::new();
    
    for address in token_addresses {
        // In a real implementation, we would fetch token info from an API
        // For now, let's create some dummy tokens
        
        match address.as_str() {
            "So11111111111111111111111111111111111111112" => {
                tokens.push(TokenInfo {
                    symbol: "SOL".to_string(),
                    name: "Solana".to_string(),
                    address: Pubkey::from_str(&address)?,
                    decimals: 9,
                    volume_24h: Some(100000000.0),
                    price_change_24h: Some(5.2),
                });
            },
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" => {
                tokens.push(TokenInfo {
                    symbol: "USDC".to_string(),
                    name: "USD Coin".to_string(),
                    address: Pubkey::from_str(&address)?,
                    decimals: 6,
                    volume_24h: Some(50000000.0),
                    price_change_24h: Some(0.1),
                });
            },
            "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZXnKzLf" => {
                tokens.push(TokenInfo {
                    symbol: "JUP".to_string(),
                    name: "Jupiter".to_string(),
                    address: Pubkey::from_str(&address)?,
                    decimals: 6,
                    volume_24h: Some(20000000.0),
                    price_change_24h: Some(8.5),
                });
            },
            _ => {
                // For unknown tokens, try to resolve them
                let pubkey = Pubkey::from_str(&address)?;
                tokens.push(TokenInfo {
                    symbol: "UNKNOWN".to_string(),
                    name: "Unknown Token".to_string(),
                    address: pubkey,
                    decimals: 9, // Default to 9 decimals
                    volume_24h: None,
                    price_change_24h: None,
                });
            }
        }
    }
    
    Ok(tokens)
} 