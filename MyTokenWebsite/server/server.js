import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

// ── Middleware ──
app.use(express.json());

// Allow requests from the frontend (adjust origin in production)
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*'
}));

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: GEMINI_MODEL });
});

// ── Chat proxy ──
app.post('/api/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server.' });
  }

  const { history } = req.body;

  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'Invalid request: history array is required.' });
  }

  // Validate each entry has the expected shape
  for (const turn of history) {
    if (!turn.role || !Array.isArray(turn.parts) || !turn.parts[0]?.text) {
      return res.status(400).json({ error: 'Malformed history entry.' });
    }
  }

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: history,
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data?.error?.message || `Gemini API error ${geminiRes.status}`;
      return res.status(geminiRes.status).json({ error: msg });
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response received.';
    res.json({ reply });

  } catch (err) {
    console.error('Gemini fetch failed:', err);
    res.status(502).json({ error: 'Failed to reach Gemini API.' });
  }
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`OKH chat server running on http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    console.warn('⚠  GEMINI_API_KEY is not set — add it to server/.env');
  }
});
