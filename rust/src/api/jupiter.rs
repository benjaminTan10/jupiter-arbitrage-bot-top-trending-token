use anyhow::Result;
use jupiter_swap_api_client::{
    JupiterSwapApiClient,
    quote::{QuoteRequest, SwapMode},
    swap::SwapRequest,
    transaction_config::TransactionConfig,
};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;

/// Get real-time price for a token pair
pub async fn get_price(client: &JupiterSwapApiClient, input_mint: Pubkey, output_mint: Pubkey, amount: u64) -> Result<f64> {
    let quote_request = QuoteRequest {
        input_mint,
        output_mint,
        amount,
        swap_mode: Some(SwapMode::ExactIn),
        slippage_bps: 50, // 0.5%
        ..QuoteRequest::default()
    };
    
    let quote_response = client.quote(&quote_request).await?;
    
    // Calculate price from in_amount and out_amount
    let in_amount = quote_response.in_amount as f64;
    let out_amount = quote_response.out_amount as f64;
    
    let price = out_amount / in_amount;
    Ok(price)
}

/// Get best quote for a token swap
pub async fn get_best_quote(
    client: &JupiterSwapApiClient,
    input_mint: Pubkey, 
    output_mint: Pubkey, 
    amount: u64,
    slippage_bps: u16
) -> Result<jupiter_swap_api_client::quote::QuoteResponse> {
    let quote_request = QuoteRequest {
        input_mint,
        output_mint,
        amount,
        swap_mode: Some(SwapMode::ExactIn),
        slippage_bps,
        ..QuoteRequest::default()
    };
    
    Ok(client.quote(&quote_request).await?)
}

/// Execute a swap
pub async fn execute_swap(
    client: &JupiterSwapApiClient,
    user_public_key: Pubkey,
    quote_response: jupiter_swap_api_client::quote::QuoteResponse
) -> Result<String> {
    let swap_request = SwapRequest {
        user_public_key,
        quote_response,
        config: TransactionConfig::default(),
    };
    
    let swap_response = client.swap(&swap_request, None).await?;
    
    // In a real implementation, we would send and confirm the transaction
    // For now, just return a transaction identifier
    Ok(format!("{:?}", swap_response.swap_transaction.len()))
} 