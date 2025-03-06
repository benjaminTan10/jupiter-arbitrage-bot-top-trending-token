use anyhow::Result;
use jupiter_swap_api_client::JupiterSwapApiClient;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use std::collections::HashMap;
use std::time::Duration;

use crate::api::jupiter::{get_best_quote, get_price, execute_swap};
use crate::api::token::{get_trending_tokens, TokenInfo};
use crate::models::ArbitrageOpportunity;
use crate::utils::ui_to_amount;

/// Find arbitrage opportunities among tokens
pub async fn find_opportunities(
    client: &JupiterSwapApiClient,
    base_tokens: &[TokenInfo], 
    quote_tokens: &[TokenInfo], 
    min_profit_percent: f64,
    base_amount: u64,
    slippage_bps: u16
) -> Result<Vec<ArbitrageOpportunity>> {
    let mut opportunities = Vec::new();
    
    for base_token in base_tokens {
        for quote_token in quote_tokens {
            if base_token.address == quote_token.address {
                continue;
            }
            
            // Get quote for base -> quote
            let base_to_quote = match get_best_quote(
                client,
                base_token.address,
                quote_token.address,
                base_amount,
                slippage_bps
            ).await {
                Ok(quote) => quote,
                Err(e) => {
                    tracing::warn!("Failed to get quote for {} -> {}: {}", base_token.symbol, quote_token.symbol, e);
                    continue;
                }
            };
            
            // Get quote for quote -> base
            let quote_to_base = match get_best_quote(
                client,
                quote_token.address,
                base_token.address,
                base_to_quote.out_amount,
                slippage_bps
            ).await {
                Ok(quote) => quote,
                Err(e) => {
                    tracing::warn!("Failed to get quote for {} -> {}: {}", quote_token.symbol, base_token.symbol, e);
                    continue;
                }
            };
            
            // Calculate profit
            let profit_amount = quote_to_base.out_amount as i128 - base_amount as i128;
            let profit_percent = (profit_amount as f64 / base_amount as f64) * 100.0;
            
            if profit_percent > min_profit_percent {
                opportunities.push(ArbitrageOpportunity {
                    base_token: base_token.clone(),
                    quote_token: quote_token.clone(),
                    base_amount,
                    quote_amount: base_to_quote.out_amount,
                    profit_amount: profit_amount as i64,
                    profit_percent,
                    base_to_quote_route: base_to_quote.route_plan,
                    quote_to_base_route: quote_to_base.route_plan,
                });
            }
        }
    }
    
    // Sort by profit percentage (highest first)
    opportunities.sort_by(|a, b| b.profit_percent.partial_cmp(&a.profit_percent).unwrap());
    
    Ok(opportunities)
}

/// Execute an arbitrage opportunity
pub async fn execute_opportunity(
    client: &JupiterSwapApiClient,
    opportunity: &ArbitrageOpportunity, 
    wallet: &Keypair
) -> Result<(String, String)> {
    // Execute first swap (base -> quote)
    let base_to_quote_request = get_best_quote(
        client,
        opportunity.base_token.address,
        opportunity.quote_token.address,
        opportunity.base_amount,
        100 // 1% slippage
    ).await?;
    
    let tx1 = execute_swap(
        client,
        wallet.pubkey(),
        base_to_quote_request
    ).await?;
    
    // In a real implementation, we would wait for the transaction to confirm
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    // Execute second swap (quote -> base)
    let quote_to_base_request = get_best_quote(
        client,
        opportunity.quote_token.address,
        opportunity.base_token.address,
        opportunity.quote_amount,
        100 // 1% slippage
    ).await?;
    
    let tx2 = execute_swap(
        client,
        wallet.pubkey(),
        quote_to_base_request
    ).await?;
    
    tracing::info!(
        "Executed arbitrage: {} {} -> {} {} -> {} {} (profit: {}%)",
        opportunity.base_amount as f64 / 10_f64.powi(opportunity.base_token.decimals as i32),
        opportunity.base_token.symbol,
        opportunity.quote_amount as f64 / 10_f64.powi(opportunity.quote_token.decimals as i32),
        opportunity.quote_token.symbol,
        (opportunity.base_amount + opportunity.profit_amount as u64) as f64 / 10_f64.powi(opportunity.base_token.decimals as i32),
        opportunity.base_token.symbol,
        opportunity.profit_percent
    );
    
    Ok((tx1, tx2))
}

/// Run the arbitrage bot
pub async fn run_bot(
    wallet: Keypair,
    client: JupiterSwapApiClient,
    base_tokens: Vec<TokenInfo>,
    quote_tokens: Vec<TokenInfo>,
    base_amount: u64,
    min_profit_percent: f64,
    slippage_bps: u16,
    interval_ms: u64,
) -> Result<()> {
    tracing::info!("Starting Jupiter arbitrage bot");
    tracing::info!("Base tokens: {:?}", base_tokens.iter().map(|t| &t.symbol).collect::<Vec<_>>());
    tracing::info!("Quote tokens: {:?}", quote_tokens.iter().map(|t| &t.symbol).collect::<Vec<_>>());
    tracing::info!("Base amount: {}", base_amount);
    tracing::info!("Minimum profit: {}%", min_profit_percent);
    tracing::info!("Slippage: {} BPS", slippage_bps);
    tracing::info!("Interval: {}ms", interval_ms);
    
    loop {
        tracing::debug!("Searching for arbitrage opportunities...");
        
        let opportunities = find_opportunities(
            &client,
            &base_tokens, 
            &quote_tokens, 
            min_profit_percent,
            base_amount,
            slippage_bps
        ).await?;
        
        if !opportunities.is_empty() {
            tracing::info!("Found {} opportunities", opportunities.len());
            
            for (i, opportunity) in opportunities.iter().enumerate() {
                tracing::info!(
                    "Opportunity {}: {} -> {} -> {} (profit: {}%, amount: {})",
                    i + 1,
                    opportunity.base_token.symbol,
                    opportunity.quote_token.symbol,
                    opportunity.base_token.symbol,
                    opportunity.profit_percent,
                    opportunity.profit_amount
                );
                
                // Execute the most profitable opportunity
                if i == 0 {
                    match execute_opportunity(&client, opportunity, &wallet).await {
                        Ok((tx1, tx2)) => tracing::info!("Executed with tx_ids: {} and {}", tx1, tx2),
                        Err(e) => tracing::error!("Failed to execute: {}", e),
                    }
                }
            }
        } else {
            tracing::debug!("No arbitrage opportunities found");
        }
        
        // Wait for the specified interval
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }
} 