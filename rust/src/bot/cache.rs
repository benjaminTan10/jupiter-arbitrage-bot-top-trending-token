use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cache {
    pub start_time: DateTime<Utc>,
    pub queue: HashMap<u64, i8>,
    pub queue_throttle: u32,
    pub side_buy: bool,
    pub iteration: u64,
    pub wallet_pubkey: String,
    pub wallet_pubkey_full: String,
    
    pub iteration_per_minute: IterationStats,
    pub initial_balance: Balance,
    pub current_balance: Balance,
    pub current_profit: Profit,
    pub last_balance: Balance,
    pub profit: Profit,
    pub max_profit_spotted: MaxProfit,
    pub trade_counter: TradeCounter,
    pub ui: UiConfig,
    pub chart: ChartData,
    pub hotkeys: Hotkeys,
    
    pub trading_enabled: bool,
    pub wrap_unwrap_sol: bool,
    pub swapping_right_now: bool,
    pub fetching_results: bool,
    pub fetching_results_start: Instant,
    pub trade_history: Vec<TradeHistory>,
    pub performance_of_tx_start: Instant,
    pub available_routes: AvailableRoutes,
    pub is_setup_done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationStats {
    pub start: Instant,
    pub value: f64,
    pub counter: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub token_a: u64,
    pub token_b: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profit {
    pub token_a: f64,
    pub token_b: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaxProfit {
    pub buy: f64,
    pub sell: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeCounter {
    pub buy: TradeStats,
    pub sell: TradeStats,
    pub failed_balance_check: u32,
    pub error_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeStats {
    pub success: u32,
    pub fail: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub default_color: String,
    pub show_performance_chart: bool,
    pub show_profit_chart: bool,
    pub show_trade_history: bool,
    pub hide_rpc: bool,
    pub show_help: bool,
    pub allow_clear: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartData {
    pub spotted_max: SpottedMax,
    pub performance_of_route_comp: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpottedMax {
    pub buy: Vec<f64>,
    pub sell: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hotkeys {
    pub e: bool,
    pub r: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableRoutes {
    pub buy: u32,
    pub sell: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeHistory {
    pub date: String,
    pub buy: bool,
    pub input_token: String,
    pub output_token: String,
    pub in_amount: f64,
    pub out_amount: f64,
    pub expected_out_amount: f64,
    pub expected_profit: f64,
    pub profit: f64,
    pub performance_of_tx: f64,
    pub error: Option<String>,
    pub slippage: f64,
}

impl Default for Cache {
    fn default() -> Self {
        Self {
            start_time: Utc::now(),
            queue: HashMap::new(),
            queue_throttle: 1,
            side_buy: true,
            iteration: 0,
            wallet_pubkey: String::new(),
            wallet_pubkey_full: String::new(),
            iteration_per_minute: IterationStats::default(),
            initial_balance: Balance::default(),
            current_balance: Balance::default(),
            current_profit: Profit::default(),
            last_balance: Balance::default(),
            profit: Profit::default(),
            max_profit_spotted: MaxProfit::default(),
            trade_counter: TradeCounter::default(),
            ui: UiConfig::default(),
            chart: ChartData::default(),
            hotkeys: Hotkeys::default(),
            trading_enabled: true,
            wrap_unwrap_sol: true,
            swapping_right_now: false,
            fetching_results: false,
            fetching_results_start: Instant::now(),
            trade_history: Vec::new(),
            performance_of_tx_start: Instant::now(),
            available_routes: AvailableRoutes::default(),
            is_setup_done: false,
        }
    }
}

impl Cache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update_iteration_per_minute(&mut self) {
        // Implementation
    }

    pub fn record_trade(&mut self, trade: TradeHistory) {
        self.trade_history.push(trade);
    }
} 