const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', name: 'Athena Intelligence Server', version: '2.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/generate', async (req, res) => {
  const { prompt, maxTokens = 1200 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
  try {
    const result = await callClaude(apiKey, prompt, Math.min(maxTokens, 1200));
    res.json({ text: result });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { prompt, maxTokens = 800 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  try {
    const result = await callClaude(apiKey, prompt, Math.min(maxTokens, 800));
    res.json({ text: result });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

async function callClaude(apiKey, userPrompt, maxTokens) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'web-search-2025-03-05'
  };

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    messages: [{ role: 'user', content: userPrompt }]
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '30');
    const waitMs = Math.min(retryAfter * 1000, 60000);
    console.log(`Rate limited. Waiting ${waitMs}ms...`);
    await sleep(waitMs);
    const retry = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    if (!retry.ok) {
      const e = await retry.text();
      throw new Error(`Anthropic API ${retry.status}: ${e}`);
    }
    return extractText(await retry.json());
  }

  if (!response.ok) {
    const e = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${e}`);
  }

  return extractText(await response.json());
}

function extractText(data) {
  if (!data || !data.content) throw new Error('No content in response');
  const texts = data.content
    .filter(b => b && b.type === 'text' && b.text && b.text.trim())
    .map(b => b.text.trim());
  if (texts.length > 0) return texts.join('\n');
  throw new Error(`No text in response (stop_reason: ${data.stop_reason || 'unknown'})`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(PORT, () => {
  console.log(`✦ Athena Intelligence Server v2.0 running on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠ WARNING: ANTHROPIC_API_KEY not set');
});
