use anyhow::Result;
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub name: String,
    pub address: Pubkey,
    pub decimals: u8,
    pub volume_24h: Option<f64>,
    pub price_change_24h: Option<f64>,
}

/// Get top trending tokens from Jupiter
pub async fn get_trending_tokens(limit: usize) -> Result<Vec<TokenInfo>> {
    // In a real implementation, this would make an API call to Jupiter
    // For now, we'll return a static list of popular tokens
    
    // This is just placeholder data - in production we would fetch from an API
    let tokens = vec![
        TokenInfo {
            symbol: "SOL".to_string(),
            name: "Solana".to_string(),
            address: Pubkey::from_str("So11111111111111111111111111111111111111112")?,
            decimals: 9,
            volume_24h: Some(100000000.0),
            price_change_24h: Some(5.2),
        },
        TokenInfo {
            symbol: "USDC".to_string(),
            name: "USD Coin".to_string(),
            address: Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")?,
            decimals: 6,
            volume_24h: Some(50000000.0),
            price_change_24h: Some(0.1),
        },
        TokenInfo {
            symbol: "JUP".to_string(),
            name: "Jupiter".to_string(),
            address: Pubkey::from_str("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZXnKzLf")?,
            decimals: 6,
            volume_24h: Some(20000000.0),
            price_change_24h: Some(8.5),
        },
    ];
    
    Ok(tokens.into_iter().take(limit).collect())
} 