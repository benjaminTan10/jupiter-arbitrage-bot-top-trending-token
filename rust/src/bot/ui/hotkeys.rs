use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::bot::cache::Cache;

pub async fn listen_hotkeys(cache: Arc<Mutex<Cache>>) {
    loop {
        if let Event::Key(KeyEvent { code, modifiers, .. }) = event::read().unwrap() {
            let mut cache = cache.lock().await;
            
            match (code, modifiers) {
                (KeyCode::Char('c'), KeyModifiers::CONTROL) => {
                    cache.ui.allow_clear = false;
                    break;
                }
                (KeyCode::Char('e'), KeyModifiers::NONE) => {
                    cache.hotkeys.e = true;
                }
                (KeyCode::Char('r'), KeyModifiers::NONE) => {
                    cache.hotkeys.r = true;
                }
                (KeyCode::Char('p'), KeyModifiers::NONE) => {
                    cache.ui.show_profit_chart = !cache.ui.show_profit_chart;
                }
                (KeyCode::Char('l'), KeyModifiers::NONE) => {
                    cache.ui.show_performance_chart = !cache.ui.show_performance_chart;
                }
                (KeyCode::Char('t'), KeyModifiers::NONE) => {
                    cache.ui.show_trade_history = !cache.ui.show_trade_history;
                }
                (KeyCode::Char('i'), KeyModifiers::NONE) => {
                    cache.ui.hide_rpc = !cache.ui.hide_rpc;
                }
                (KeyCode::Char('h'), KeyModifiers::NONE) => {
                    cache.ui.show_help = !cache.ui.show_help;
                }
                (KeyCode::Char('s'), KeyModifiers::NONE) => {
                    cache.trading_enabled = !cache.trading_enabled;
                }
                _ => {}
            }
        }
    }
} 