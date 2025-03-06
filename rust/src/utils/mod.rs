use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

/// Convert amount with decimals to raw amount
pub fn amount_to_ui(amount: u64, decimals: u8) -> f64 {
    amount as f64 / 10_f64.powi(decimals as i32)
}

/// Convert UI amount to raw amount
pub fn ui_to_amount(ui_amount: f64, decimals: u8) -> u64 {
    (ui_amount * 10_f64.powi(decimals as i32)) as u64
}

/// Calculate profit percentage
pub fn calculate_profit_percentage(initial: u64, final_amount: u64) -> f64 {
    ((final_amount as f64 - initial as f64) / initial as f64) * 100.0
}

/// Format pubkey as short string
pub fn short_pubkey(pubkey: &Pubkey) -> String {
    let pubkey_str = pubkey.to_string();
    format!("{}...{}", &pubkey_str[0..4], &pubkey_str[pubkey_str.len()-4..])
} 