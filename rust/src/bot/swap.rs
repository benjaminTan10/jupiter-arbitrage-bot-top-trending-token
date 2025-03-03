use anyhow::Result;
use solana_sdk::transaction::VersionedTransaction;
use tracing::{info, warn};

use crate::bot::{cache::Cache, jupiter::JupiterClient};

pub async fn execute_swap(
    jupiter: &JupiterClient,
    cache: &mut Cache,
    amount: u64,
    slippage_bps: u16,
) -> Result<()> {
    info!("Executing swap...");
    
    let quote = jupiter
        .get_quote(
            cache.input_token,
            cache.output_token,
            amount,
            slippage_bps,
        )
        .await?;

    info!("Got quote with price impact: {}%", quote.price_impact_pct);

    let transaction = jupiter.swap(cache.wallet_pubkey, quote).await?;

    // Record trade in cache
    cache.record_trade(TradeHistory {
        date: chrono::Utc::now().to_string(),
        buy: cache.side_buy,
        input_token: cache.input_token.to_string(),
        output_token: cache.output_token.to_string(),
        in_amount: amount as f64,
        out_amount: quote.out_amount as f64,
        expected_out_amount: quote.other_amount_threshold as f64,
        expected_profit: quote.price_impact_pct.to_f64().unwrap(),
        profit: 0.0, // Will be updated after confirmation
        performance_of_tx: 0.0,
        error: None,
        slippage: slippage_bps as f64,
    });

    Ok(())
} 