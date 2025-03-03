use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub const DISCORD_INVITE_URL: &str = "https://discord.gg/Z8JJCuq4";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigInitialState {
    pub show_help: bool,
    pub nav: Navigation,
    pub config: ConfigState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Navigation {
    pub current_step: usize,
    pub steps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigState {
    pub network: ConfigValue<String>,
    pub rpc: RpcConfig,
    pub strategy: ConfigValue<String>,
    pub tokens: TokenConfig,
    pub trading_size: TradingSizeConfig,
    pub profit: ProfitConfig,
    pub slippage: ConfigValue<f64>,
    pub priority: ConfigValue<u32>,
    pub advanced: AdvancedConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValue<T> {
    pub value: T,
    pub is_set: bool,
}

// Add other required structs...

impl Default for ConfigInitialState {
    fn default() -> Self {
        Self {
            show_help: true,
            nav: Navigation {
                current_step: 0,
                steps: vec![
                    "network".to_string(),
                    "rpc".to_string(),
                    "strategy".to_string(),
                    "tokens".to_string(),
                    "trading size".to_string(),
                    "profit".to_string(),
                    "slippage".to_string(),
                    "priority".to_string(),
                    "advanced".to_string(),
                    "confirm".to_string(),
                ],
            },
            config: ConfigState::default(),
        }
    }
} 