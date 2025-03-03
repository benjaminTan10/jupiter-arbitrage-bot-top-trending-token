use anyhow::Result;
use jupiter_swap_api_client::{
    quote::QuoteRequest,
    swap::{SwapRequest, SwapResponse},
    transaction_config::TransactionConfig,
    JupiterSwapApiClient,
};
use solana_sdk::{pubkey::Pubkey, transaction::VersionedTransaction};

pub struct JupiterClient {
    api_client: JupiterSwapApiClient,
}

impl JupiterClient {
    pub fn new() -> Self {
        let api_base_url = std::env::var("API_BASE_URL")
            .unwrap_or_else(|_| "https://quote-api.jup.ag/v6".to_string());
            
        Self {
            api_client: JupiterSwapApiClient::new(api_base_url),
        }
    }

    pub async fn get_quote(
        &self,
        input_mint: Pubkey,
        output_mint: Pubkey,
        amount: u64,
        slippage_bps: u16,
    ) -> Result<QuoteResponse> {
        let quote_request = QuoteRequest {
            amount,
            input_mint,
            output_mint,
            slippage_bps,
            ..QuoteRequest::default()
        };

        let quote_response = self.api_client.quote(&quote_request).await?;
        Ok(quote_response)
    }

    pub async fn swap(
        &self,
        user_pubkey: Pubkey,
        quote_response: QuoteResponse,
    ) -> Result<VersionedTransaction> {
        let swap_request = SwapRequest {
            user_public_key: user_pubkey,
            quote_response,
            config: TransactionConfig::default(),
        };

        let SwapResponse { swap_transaction, .. } = self.api_client.swap(&swap_request, None).await?;
        
        let versioned_transaction: VersionedTransaction = bincode::deserialize(&swap_transaction)?;
        Ok(versioned_transaction)
    }
} 