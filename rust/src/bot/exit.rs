use anyhow::Result;
use std::fs;
use tracing::info;
use colored::*;
use crate::bot::cache::Cache;

pub fn log_exit(code: i32, error: Option<anyhow::Error>) {
    match code {
        0 => {
            if let Some(err) = error {
                println!("{}", err.to_string().black().on_magenta().bold());
            }
        }
        1 => {
            if let Some(err) = error {
                println!("{}", format!("ERROR: {}", err).black().on_red());
                println!("{}", err.backtrace().to_string().red());
            }
        }
        _ => {}
    }
}

pub fn handle_exit(cache: &Cache) -> Result<()> {
    info!("Exit time: {}", chrono::Local::now());

    // Save cache to file
    if let Err(e) = fs::write("./temp/cache.json", serde_json::to_string_pretty(cache)?) {
        println!("{}", "Error saving cache to ./temp/cache.json".black().on_red());
        return Err(e.into());
    }
    println!("{}", "Cache saved to ./temp/cache.json".black().on_green());

    // Save trade history
    if let Err(e) = fs::write(
        "./temp/tradeHistory.json",
        serde_json::to_string_pretty(&cache.trade_history)?
    ) {
        println!("{}", "Error saving trade history".black().on_red());
        return Err(e.into());
    }
    println!("{}", "Trade history saved to ./temp/tradeHistory.json".black().on_green());

    println!("{}", "Exit Done!".black().on_magenta().bold());
    Ok(())
} 