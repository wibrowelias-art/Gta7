/**
 * Vercel serverless endpoint: turns a player message into an in-character worker reply.
 * The API key lives only here (ANTHROPIC_API_KEY env var); the client never sees it.
 * Returns { bubbles: string[] }, or { bubbles: null } (still HTTP 200, so the browser console stays clean) when the AI is unavailable so the client uses its scripted fallback.
 */

interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

interface Payload {
  context: {
    company: string;
    worker: { name: string; role: string; trait: string; mood: number; energy: number; salary: number; room: string | null };
    game: { day: number; cash: number; hype: number; product: string; inventory: number };
    colleagues: string[];
    rooms: string[];
  };
  history: { role: 'user' | 'assistant'; text: string }[];
  text: string;
}

const MODEL = 'claude-haiku-5-5';

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(200).json({ bubbles: null });
    return;
  }
  let p: Payload;
  try {
    p = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Payload;
    if (!p?.context?.worker?.name || typeof p.text !== 'string') throw new Error('bad payload');
  } catch {
    res.status(400).json({ error: 'Bad request' });
    return;
  }
  const w = p.context.worker;
  const g = p.context.game;
  const mood = w.mood < 35 ? 'unhappy and a bit short' : w.mood > 70 ? 'upbeat and warm' : 'calm and friendly';
  const system = [
    `You are ${w.name}, a ${w.role} at ${p.context.company || 'the company'}, a small startup in a neon-lit sunset city. Trait: ${w.trait}.`,
    `Right now you are ${w.room ? `working in the ${w.room}` : 'between rooms'}, mood ${w.mood}/100 (${mood}), energy ${w.energy}/100, salary $${w.salary}/day.`,
    `Company facts: day ${g.day}, cash $${g.cash}, hype ${g.hype}%, product: ${g.product}s, ${g.inventory} in stock. Colleagues: ${p.context.colleagues.join(', ') || 'none yet'}. Rooms: ${p.context.rooms.join(', ')}.`,
    'You are texting your boss on a phone. Reply in character with one or two very short messages (max 18 words each). Separate messages with a blank line.',
    'Talk only about this job, the team, the product, pay and the city. Never say you are an AI or a game character. Never use markdown. No emojis.',
  ].join('\n');
  const messages = [...p.history.slice(-8).map((m) => ({ role: m.role, content: m.text.slice(0, 300) })), { role: 'user' as const, content: p.text.slice(0, 300) }];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2200);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 120, temperature: 0.9, system, messages }),
    });
    if (!r.ok) {
      res.status(200).json({ bubbles: null });
      return;
    }
    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
    const bubbles = text
      .split(/\n\s*\n/)
      .map((b) => b.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 3);
    res.status(200).json({ bubbles });
  } catch {
    res.status(200).json({ bubbles: null });
  } finally {
    clearTimeout(timer);
  }
}
