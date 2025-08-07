// Manual claim detection test
export default async function handler(req, res) {
  try {
    const wallet = "A1nQejA73NRszZ5t2dQH4hoNnW33LwLbLYHv6XbQhC4";
    const FEE_PROGRAM = 'FEEhPbKVKnco9EXnaY3i4R5rQVUx91wgVfu8qokixywi';
    
    const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
    const rpcUrl = HELIUS_API_KEY 
      ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
      : 'https://api.mainnet-beta.solana.com';

    console.log('Checking wallet for recent claims...');
    
    // Get recent transactions
    const signaturesResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [wallet, { limit: 10 }]
      })
    });

    const signaturesData = await signaturesResponse.json();
    const signatures = signaturesData?.result || [];
    
    let claimsFound = [];
    
    // Check each recent transaction
    for (const sig of signatures.slice(0, 5)) {
      try {
        const txResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]
          })
        });
        
        const txData = await txResponse.json();
        const transaction = txData?.result?.transaction;
        const meta = txData?.result?.meta;
        
        if (!transaction || !meta) continue;
        
        const accountKeys = transaction.message.accountKeys;
        const involvesFeeProgram = accountKeys.includes(FEE_PROGRAM);
        
        if (involvesFeeProgram) {
          // Check for positive balance change
          const preBalances = meta.preBalances || [];
          const postBalances = meta.postBalances || [];
          let hasPositiveChange = false;
          
          for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
            if (postBalances[i] > preBalances[i]) {
              hasPositiveChange = true;
              break;
            }
          }
          
          if (hasPositiveChange) {
            claimsFound.push({
              signature: sig.signature,
              timestamp: sig.blockTime,
              timeAgo: Math.floor((Date.now() / 1000 - sig.blockTime) / 60) + ' minutes ago'
            });
          }
        }
      } catch (error) {
        console.error('Error checking tx:', error.message);
      }
    }
    
    return res.status(200).json({
      wallet: wallet,
      recentTransactions: signatures.length,
      claimsFound: claimsFound,
      shouldTriggerAlert: claimsFound.length > 0
    });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
