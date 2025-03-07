const { Connection } = require('@solana/web3.js');

/**
 * Check the health of an RPC endpoint
 * @param {string} rpcUrl - The RPC URL to check
 * @returns {Promise<{healthy: boolean, latency: number, error: string|null}>}
 */
async function checkRpcHealth(rpcUrl) {
  const start = Date.now();
  let healthy = false;
  let error = null;
  
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    
    // Try to get a recent block
    const blockHeight = await connection.getBlockHeight();
    const latency = Date.now() - start;
    
    // If we got this far, the RPC is responding
    healthy = blockHeight > 0;
    
    return {
      healthy,
      latency,
      error: null
    };
  } catch (err) {
    const latency = Date.now() - start;
    error = err.message;
    
    return {
      healthy: false,
      latency,
      error
    };
  }
}

/**
 * Find the best working RPC from a list
 * @param {Array<string>} rpcUrls - List of RPC URLs to check
 * @returns {Promise<string|null>} The best RPC URL or null if all fail
 */
async function findBestRpc(rpcUrls) {
  if (!rpcUrls || rpcUrls.length === 0) {
    console.error('No RPC URLs provided to check');
    return null;
  }
  
  console.log(`Checking health of ${rpcUrls.length} RPC endpoints...`);
  
  const results = await Promise.all(
    rpcUrls.map(async (url) => {
      const health = await checkRpcHealth(url);
      return {
        url,
        ...health
      };
    })
  );
  
  // Filter healthy RPCs and sort by latency
  const healthyRpcs = results
    .filter(r => r.healthy)
    .sort((a, b) => a.latency - b.latency);
  
  if (healthyRpcs.length === 0) {
    console.error('All RPC endpoints failed health checks!');
    console.error('Errors:', results.map(r => `${r.url}: ${r.error}`).join(', '));
    return null;
  }
  
  const bestRpc = healthyRpcs[0];
  console.log(`Selected best RPC: ${bestRpc.url} (${bestRpc.latency}ms latency)`);
  
  return bestRpc.url;
}

module.exports = { checkRpcHealth, findBestRpc }; 