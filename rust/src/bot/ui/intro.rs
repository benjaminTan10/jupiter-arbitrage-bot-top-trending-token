use anyhow::Result;
use colored::*;
use std::{thread, time::Duration};

const UNIVERSE_SIZE: usize = 15;
const COLORS: &[&str] = &[
    "#cf4884", "#8832b3", "#b5b4fa",
    "#cdadff", "#6d29c5", "#4e21d9", "#481ede"
];

pub async fn show_intro() -> Result<()> {
    if std::env::var("SKIP_INTRO").unwrap_or_default() == "true" {
        return Ok(());
    }

    let mut colors = COLORS.to_vec();

    for i in 0..200 {
        let speed = if i > 50 { 100 - i } else { i };
        
        // Rotate colors
        let first = colors.remove(0);
        colors.push(first);

        // Clear screen
        print!("\x1B[2J\x1B[1;1H");

        // Print universe
        for _ in 0..UNIVERSE_SIZE {
            let padding = rand::random::<u8>() as usize;
            let spaces = " ".repeat(padding);
            
            let char = if i > 30 {
                if i > 180 {
                    "/".repeat(rand::random::<u8>() as usize % 3 + 1)
                } else {
                    "-".repeat(rand::random::<u8>() as usize % 3 + 1)
                }
            } else {
                "•".to_string()
            };

            println!("{}{}", spaces, char.white());
        }

        thread::sleep(Duration::from_millis(speed as u64));
    }

    Ok(())
} 