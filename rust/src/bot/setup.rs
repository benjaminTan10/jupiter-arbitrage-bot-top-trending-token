use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, read_keypair_file},
};
use std::str::FromStr;
use tracing::{info, warn};

use crate::{
    bot::{cache::Cache, jupiter::JupiterClient, ui::intro::show_intro},
    utils::config::Config,
};

pub struct Setup {
    pub jupiter: JupiterClient,
    pub rpc_client: RpcClient,
    pub wallet: Keypair,
    pub input_token: Pubkey,
    pub output_token: Option<Pubkey>,
}

pub async fn setup(skip_intro: bool) -> Result<Setup> {
    // Show intro unless skipped
    if !skip_intro {
        show_intro().await?;
    }

    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize RPC client
    let rpc_url = std::env::var("SOLANA_RPC_URL")?;
    let rpc_client = RpcClient::new(rpc_url);

    // Load wallet
    let wallet = read_keypair_file(std::env::var("SOLANA_WALLET_PRIVATE_KEY")?)?;

    // Initialize Jupiter client
    let jupiter = JupiterClient::new();

    // Load token addresses from environment
    let input_token = Pubkey::from_str(&std::env::var("INPUT_TOKEN_ADDRESS")?)?;
    let output_token = std::env::var("OUTPUT_TOKEN_ADDRESS")
        .ok()
        .map(|addr| Pubkey::from_str(&addr))
        .transpose()?;

    Ok(Setup {
        jupiter,
        rpc_client,
        wallet,
        input_token,
        output_token,
    })
}

// Add helper functions for balance checking, token loading etc. 