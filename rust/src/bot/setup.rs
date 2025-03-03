use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Keypair, read_keypair_file},
};
use std::str::FromStr;
use tracing::{info, warn};

use crate::{
    bot::{cache::Cache, ui::intro::show_intro},
    utils::config::Config,
};

pub struct Setup {
    pub jupiter: JupiterClient,
    pub token_a: Token,
    pub token_b: Option<Token>,
    pub wallet: Keypair,
}

pub async fn setup(skip_intro: bool) -> Result<Setup> {
    // Show intro unless skipped
    if !skip_intro {
        show_intro().await?;
    }

    // Load config
    let config = Config::load()?;
    
    // Setup RPC connection
    let rpc = RpcClient::new(&config.rpc[0]);

    // Load wallet
    let wallet = read_keypair_file(std::env::var("SOLANA_WALLET_PRIVATE_KEY")?)?;

    // Initialize Jupiter client
    let jupiter = JupiterClient::new(
        &rpc,
        &wallet,
        config.network.clone(),
        config.amms_to_exclude.clone(),
    )?;

    // Load tokens
    let tokens = load_tokens()?;
    let token_a = tokens.iter()
        .find(|t| t.address == config.token_a.address)
        .ok_or_else(|| anyhow::anyhow!("Token A not found"))?
        .clone();

    let token_b = if config.trading_strategy != "arbitrage" {
        Some(
            tokens.iter()
                .find(|t| t.address == config.token_b.address)
                .ok_or_else(|| anyhow::anyhow!("Token B not found"))?
                .clone()
        )
    } else {
        None
    };

    Ok(Setup {
        jupiter,
        token_a,
        token_b,
        wallet,
    })
}

// Add helper functions for balance checking, token loading etc. 