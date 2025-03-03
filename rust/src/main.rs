use anyhow::Result;
use clap::Parser;
use dotenv::dotenv;
use solana_jupiter_bot_rust::{bot, wizard};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Run in wizard mode
    #[arg(short, long)]
    wizard: bool,

    /// Skip intro animation
    #[arg(long)]
    skip_intro: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv().ok();

    // Initialize logging
    tracing_subscriber::fmt::init();

    // Parse command line arguments
    let cli = Cli::parse();

    if cli.wizard {
        wizard::run()?;
    } else {
        bot::run(cli.skip_intro).await?;
    }

    Ok(())
} 