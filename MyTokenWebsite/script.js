// -- Config --
const CONTRACT_ADDRESS = '0x58E9A0c9A997B8276Def81548A003A827A917C91';
const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex
const TOKEN_DECIMALS = 18;

// Minimal ERC-20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// -- State --
let provider = null;
let userAddress = null;

// -- Wait for ethereum to be injected --
function getEthereum() {
  return new Promise((resolve) => {
    if (window.ethereum) return resolve(window.ethereum);
    window.addEventListener('ethereum#initialized', () => resolve(window.ethereum), { once: true });
    setTimeout(() => resolve(window.ethereum || null), 3000);
  });
}

// -- Connect Wallet --
async function connectWallet() {
  const ethereum = await getEthereum();
  if (!ethereum) {
    alert('No wallet detected. Please install MetaMask or a compatible browser wallet.');
    return;
  }
  window.ethereum = ethereum;

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAddress = accounts[0];

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== SEPOLIA_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SEPOLIA_CHAIN_ID }]
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: 'Sepolia Testnet',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io']
            }]
          });
        } else {
          throw switchErr;
        }
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    await fetchBalance();
    updateUI(true);

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', () => window.location.reload());

  } catch (err) {
    console.error('Wallet connection failed:', err);
    alert('Could not connect wallet: ' + (err.message || err));
  }
}

// -- Fetch OKH balance --
async function fetchBalance() {
  try {
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC20_ABI, signer);

    const [rawBalance, decimals] = await Promise.all([
      contract.balanceOf(userAddress),
      contract.decimals().catch(() => TOKEN_DECIMALS)
    ]);

    const formatted = ethers.formatUnits(rawBalance, decimals);
    const display = parseFloat(formatted).toLocaleString(undefined, {
      maximumFractionDigits: 4
    });

    document.getElementById('wallet-balance').textContent = display + ' OKH';
  } catch (err) {
    console.error('Balance fetch failed:', err);
    document.getElementById('wallet-balance').textContent = 'Balance unavailable';
  }
}

// -- Update UI state --
function updateUI(connected) {
  const btn = document.getElementById('wallet-btn');
  const panel = document.getElementById('wallet-panel');
  const addrEl = document.getElementById('wallet-address');
  const form = document.getElementById('transfer-form');
  const notice = document.getElementById('transfer-notice');
  const statusEl = document.getElementById('transfer-status');
  const depositContent = document.getElementById('deposit-content');
  const depositNotice = document.getElementById('deposit-notice');
  const depositAddr = document.getElementById('deposit-address');

  if (connected && userAddress) {
    const short = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
    btn.textContent = short;
    btn.classList.add('connected');
    addrEl.textContent = userAddress;
    panel.classList.add('visible');
    form.style.display = 'flex';
    notice.style.display = 'none';
    depositAddr.textContent = userAddress;
    depositContent.style.display = 'flex';
    depositNotice.style.display = 'none';
  } else {
    btn.textContent = 'Connect Wallet';
    btn.classList.remove('connected');
    panel.classList.remove('visible');
    document.getElementById('wallet-balance').textContent = '';
    document.getElementById('wallet-address').textContent = '';
    form.style.display = 'none';
    notice.style.display = 'block';
    statusEl.textContent = '';
    statusEl.className = 'transfer-status';
    depositContent.style.display = 'none';
    depositNotice.style.display = 'block';
    depositAddr.textContent = '';
  }
}

// -- Disconnect --
function disconnectWallet() {
  provider = null;
  userAddress = null;
  updateUI(false);
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }
}

// -- Handle account switch --
async function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    disconnectWallet();
  } else {
    userAddress = accounts[0];
    await fetchBalance();
    updateUI(true);
  }
}

// -- Transfer OKH tokens --
async function transferTokens(event) {
  event.preventDefault();

  const recipient = document.getElementById('recipient').value.trim();
  const amountInput = document.getElementById('amount').value.trim();
  const statusEl = document.getElementById('transfer-status');
  const submitBtn = document.getElementById('transfer-btn');

  statusEl.textContent = '';
  statusEl.className = 'transfer-status';

  if (!recipient || !ethers.isAddress(recipient)) {
    setTransferStatus('error', 'Please enter a valid Ethereum address.');
    return;
  }
  if (!amountInput || isNaN(amountInput) || parseFloat(amountInput) <= 0) {
    setTransferStatus('error', 'Please enter a valid amount greater than 0.');
    return;
  }
  if (!provider || !userAddress) {
    setTransferStatus('error', 'Wallet not connected.');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    setTransferStatus('pending', 'Waiting for wallet confirmation...');

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ERC20_ABI, signer);
    const decimals = await contract.decimals().catch(() => TOKEN_DECIMALS);
    const amount = ethers.parseUnits(amountInput, decimals);

    const tx = await contract.transfer(recipient, amount);
    setTransferStatus('pending', 'Transaction submitted. Waiting for confirmation...');

    await tx.wait();

    document.getElementById('recipient').value = '';
    document.getElementById('amount').value = '';

    setTransferStatus(
      'success',
      'Transfer confirmed! <a href="https://sepolia.etherscan.io/tx/' + tx.hash + '" target="_blank" rel="noopener noreferrer">View on Etherscan</a>'
    );

    await fetchBalance();

  } catch (err) {
    console.error('Transfer failed:', err);
    const msg = err?.reason || err?.message || 'Transaction failed.';
    setTransferStatus('error', msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send OKH';
  }
}

function setTransferStatus(type, html) {
  const el = document.getElementById('transfer-status');
  el.innerHTML = html;
  el.className = 'transfer-status ' + type;
}

// -- Copy deposit address --
function copyDepositAddress() {
  const address = document.getElementById('deposit-address').textContent;
  const btn = document.getElementById('deposit-copy-btn');

  navigator.clipboard.writeText(address).then(() => {
    btn.textContent = 'Copied!';
    btn.style.background = 'var(--accent)';
    btn.style.color = '#000';
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = address;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// -- Copy contract address --
function copyAddress() {
  const address = document.getElementById('contract-address').textContent;
  const btn = document.querySelector('.copy-btn');

  navigator.clipboard.writeText(address).then(() => {
    btn.textContent = 'Copied!';
    btn.style.background = 'var(--accent)';
    btn.style.color = '#000';
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }).catch(() => {
    const el = document.createElement('textarea');
    el.value = address;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
}

// -- AI Assistant (Gemini via Cloudflare Pages Function) --

const CHAT_API_URL = '/api/chat';
let chatHistory = [];
let chatOpen = false;

function initChatGreeting() {
  if (chatHistory.length === 0) {
    appendChatMessage('model', "Hi! I'm the OKH Assistant. Ask me anything about Okhrakhushi, how to use this site, or Ethereum basics.");
  }
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open', chatOpen);
  if (chatOpen) {
    initChatGreeting();
    setTimeout(() => {
      var inp = document.getElementById('chat-input');
      if (inp) inp.focus();
    }, 300);
  }
}

async function sendChatMessage() {
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const text = inputEl.value.trim();
  if (!text) return;

  appendChatMessage('user', text);
  chatHistory.push({ role: 'user', parts: [{ text: text }] });

  inputEl.value = '';
  inputEl.style.height = 'auto';
  inputEl.disabled = true;
  sendBtn.disabled = true;
  showTyping(true);

  try {
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: chatHistory })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Server error ' + response.status);
    }

    const reply = data.reply;
    chatHistory.push({ role: 'model', parts: [{ text: reply }] });
    showTyping(false);
    appendChatMessage('model', reply);

  } catch (err) {
    console.error('Chat error:', err);
    showTyping(false);
    appendChatMessage('error', err.message || 'Could not reach the assistant.');
  } finally {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function appendChatMessage(role, text) {
  const container = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble--' + role;

  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const formatted = safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  bubble.innerHTML = formatted;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function showTyping(visible) {
  document.getElementById('chat-typing').textContent = visible ? 'OKH Assistant is thinking...' : '';
}

function handleChatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// -- Fade-in on scroll (moved to DOMContentLoaded below) --

// -- Wire up all event listeners (no inline onclick handlers) --
document.addEventListener('DOMContentLoaded', function() {

  // Wallet
  document.getElementById('wallet-btn').addEventListener('click', connectWallet);
  document.getElementById('disconnect-btn').addEventListener('click', disconnectWallet);

  // Transfer form
  document.getElementById('transfer-form').addEventListener('submit', transferTokens);

  // Copy buttons
  document.getElementById('deposit-copy-btn').addEventListener('click', copyDepositAddress);
  document.getElementById('copy-contract-btn').addEventListener('click', copyAddress);

  // Chat bubble
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);

  // Chat input: Enter to send, Shift+Enter for newline
  document.getElementById('chat-input').addEventListener('keydown', handleChatKey);

  // Chat input: auto-resize
  document.getElementById('chat-input').addEventListener('input', function() {
    autoResizeTextarea(this);
  });

  // Fade-in on scroll
  var fadeObserver = new IntersectionObserver(
    function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.card, .contract-box').forEach(function(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    fadeObserver.observe(el);
  });
});
