use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;

use crate::api::token::TokenInfo;

#[derive(Debug, Clone)]
pub struct ArbitrageOpportunity {
    pub base_token: TokenInfo,
    pub quote_token: TokenInfo,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub profit_amount: i64,
    pub profit_percent: f64,
    pub base_to_quote_route: jupiter_swap_api_client::route_plan_with_metadata::RoutePlanWithMetadata,
    pub quote_to_base_route: jupiter_swap_api_client::route_plan_with_metadata::RoutePlanWithMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub rpc_url: String,
    pub wallet_path: String,
    pub min_profit_percent: f64,
    pub interval_ms: u64,
    pub slippage_bps: u16,
    pub base_amount_ui: f64,
    pub base_tokens: Vec<String>,
    pub quote_tokens: Vec<String>,
} 