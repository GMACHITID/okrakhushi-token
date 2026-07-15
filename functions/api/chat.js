const GEMINI_MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `You are the official AI assistant for the Okhrakhushi (OKH) token website.

Key facts about OKH:
- Full name: Okhrakhushi
- Ticker symbol: OKH
- Standard: ERC-20
- Network: Ethereum Sepolia Testnet
- Contract address: 0x58E9A0c9A997B8276Def81548A003A827A917C91
- Decimals: 18
- Etherscan: https://sepolia.etherscan.io/address/0x58E9A0c9A997B8276Def81548A003A827A917C91
- Tagline: "Crunchy, liquid yet solid. A paradox of a coin."
- The website lets users connect a MetaMask wallet, view their OKH balance, deposit (receive) OKH by sharing their address, and transfer OKH to other addresses.

You can help users with:
- Questions about OKH and its features
- How to connect their MetaMask wallet
- How to deposit or receive OKH tokens
- How to transfer OKH to another address
- General ERC-20 and Ethereum / Sepolia testnet concepts
- How to get Sepolia testnet ETH from faucets
- Reading and understanding the contract on Etherscan

Be concise, friendly, and accurate. If something is outside your knowledge (e.g. real-time price, live on-chain data), say so honestly. Never invent facts about the token.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { history } = body;
  if (!Array.isArray(history) || history.length === 0) {
    return Response.json({ error: 'history array is required.' }, { status: 400 });
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: history,
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data?.error?.message || `Gemini API error ${geminiRes.status}`;
      return Response.json({ error: msg }, { status: geminiRes.status });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response received.';
    return Response.json({ reply });

  } catch (err) {
    return Response.json({ error: 'Failed to reach Gemini API.' }, { status: 502 });
  }
}
