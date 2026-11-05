import { fmtClock, h, stagger } from '../dom';
import { icon } from '../icons';
import { portrait } from '../portrait';
import type { App } from '../../app';
import type { PanelApi, PanelModule } from '../panel';
import { msg, roomById, roomName, workerById } from '../../game/sim';
import { chatContext, QUICK_REPLIES, scriptedReply } from '../../game/chat';
import type { Worker } from '../../game/types';
import { empty } from './common';

const pending = new Set<string>();

function renderList(app: App, api: PanelApi): void {
  const s = app.state;
  api.setTitle('Messages', `${s.workers.length} ${s.workers.length === 1 ? 'chat' : 'chats'}`, 'chat');
  if (!s.workers.length) {
    api.body.appendChild(empty('chat', 'No one to text yet. Hire a worker and they will say hi.', { label: 'Hire', onClick: () => app.openPanel('hire') }));
    return;
  }
  const sorted = [...s.workers].sort((a, b) => (s.chats[b.id]?.at(-1)?.at ?? 0) - (s.chats[a.id]?.at(-1)?.at ?? 0));
  const rows = sorted.map((w) => {
    const last = s.chats[w.id]?.at(-1);
    return h(
      'div.card.clickable',
      { role: 'button', tabIndex: '0', dataset: { chat: w.id }, style: { flexDirection: 'row', alignItems: 'center' }, on: { click: () => app.openPanel('chat', { workerId: w.id }) } },
      h('div.avatar', {}, portrait(w, 44)),
      h('div.col.grow', {}, h('div.row.between', {}, h('span.display.t18', { text: w.name }), last ? h('span.t11.muted.num', { text: fmtClock(last.at) }) : null), h('div.t13.sec.ellip', { text: last ? (last.from === 'you' ? 'You: ' : '') + last.text : 'Say hi' })),
      w.unread ? h('span.badge', { text: String(w.unread), style: { position: 'static' } }) : null,
    );
  });
  api.body.appendChild(stagger(h('div.col.chat-list', {}, ...rows)));
}

function renderThread(app: App, api: PanelApi, w: Worker): void {
  const s = app.state;
  const room = roomById(s, w.roomId);
  api.setTitle(w.name, room ? `${w.role} · in ${roomName(s, room)}` : `${w.role} · ${w.state === 'walk' ? 'on the move' : 'waiting for a desk'}`, 'chat');
  api.body.dataset.chatOpen = w.id;
  api.body.style.padding = '12px 12px 4px';
  const list = s.chats[w.id] ?? (s.chats[w.id] = []);
  for (const m of list) m.read = true;
  w.unread = 0;

  const back = h('button.icon-btn', { 'aria-label': 'All chats', style: { position: 'absolute', right: '56px', top: '8px' }, on: { click: () => app.openPanel('chat', { back: true }) } }, icon('back'));
  api.body.parentElement?.querySelector('.panel-head')?.appendChild(back);

  const thread = h('div.chat-thread');
  const bubble = (m: { from: string; text: string; at: number; read?: boolean }, animate = true) => {
    if (m.from === 'system') return h('div.bubble.system', { text: m.text, style: animate ? {} : { animation: 'none' } });
    const b = h(`div.bubble.${m.from}`, { style: animate ? {} : { animation: 'none' } }, m.text, h('div.meta', {}, h('span', { text: fmtClock(m.at) }), m.from === 'you' ? h('span', { text: '✓✓', style: { color: m.read ? '#1a0b12' : 'rgba(26,11,18,0.5)' } }) : null));
    return h(`div.bubble-row.${m.from}`, {}, m.from === 'worker' ? h('div.avatar.sm', {}, portrait(w, 32)) : null, b);
  };
  for (const m of list) thread.appendChild(bubble(m, false));
  api.body.appendChild(thread);
  const scrollEnd = () => requestAnimationFrame(() => (api.body.scrollTop = api.body.scrollHeight));
  scrollEnd();

  const typing = h('div.bubble-row.worker', {}, h('div.avatar.sm', {}, portrait(w, 32)), h('div.bubble.worker.typing', {}, h('i'), h('i'), h('i')));

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending.has(w.id)) return;
    pending.add(w.id);
    input.value = '';
    const mine = msg(s, 'you', t);
    list.push(mine);
    thread.appendChild(bubble(mine));
    scrollEnd();
    app.audio?.play('pop');
    const local = scriptedReply(s, w, t);
    app.dispatch(local.fx);
    let bubbles = local.bubbles;
    if (!local.action) bubbles = await aiReply(app, w, t, list).catch(() => null) ?? local.bubbles;
    // Typing indicator for 1–3 seconds total, split across bubbles.
    const delay = Math.min(3000, 900 + t.length * 15);
    thread.appendChild(typing);
    scrollEnd();
    const perBubble = Math.max(500, delay / bubbles.length);
    for (let i = 0; i < bubbles.length; i++) {
      await wait(app.reducedMotion ? 100 : perBubble);
      const m = msg(s, 'worker', bubbles[i]);
      m.read = true;
      list.push(m);
      typing.remove();
      thread.appendChild(bubble(m));
      if (i < bubbles.length - 1) thread.appendChild(typing);
      app.audio?.play('notify');
      scrollEnd();
    }
    if (local.action) {
      const sys = msg(s, 'system', local.action);
      list.push(sys);
      thread.appendChild(bubble(sys));
      scrollEnd();
    }
    mine.read = true;
    pending.delete(w.id);
    app.save();
    app.emit('change');
  };

  const chips = h('div.quick-replies', {}, ...QUICK_REPLIES.map((q) => h('button.chip', { text: q, on: { click: () => send(q) } })));
  const input = h('input', { type: 'text', placeholder: `Message ${w.name}`, 'aria-label': `Message ${w.name}`, maxLength: '200', autocomplete: 'off' }) as HTMLInputElement;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && send(input.value));
  const sendBtn = h('button.btn.primary', { 'aria-label': 'Send', style: { flex: '0 0 52px', padding: '0' }, on: { click: () => send(input.value) } }, icon('send'));
  api.foot.style.padding = '0';
  api.foot.style.flexDirection = 'column';
  api.foot.style.gap = '0';
  api.foot.append(chips, h('div.chat-input', {}, input, sendBtn));
  api.onDispose(() => back.remove());
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ask the server-side AI for a reply. Resolves to null when unavailable so the scripted reply is used. */
async function aiReply(app: App, w: Worker, text: string, history: { from: string; text: string }[]): Promise<string[] | null> {
  if (!navigator.onLine) return null;
  // The serverless endpoint only exists on the deployed site.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ context: chatContext(app.state, w), history: history.slice(-8).map((m) => ({ role: m.from === 'you' ? 'user' : 'assistant', text: m.text })), text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { bubbles?: string[] };
    const bubbles = (data.bubbles ?? []).map((b) => String(b).trim()).filter(Boolean).slice(0, 3);
    return bubbles.length ? bubbles : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const chatPanel: PanelModule = {
  title: 'Messages',
  icon: 'chat',
  render(app, api) {
    const w = workerById(app.state, (api.params.workerId as string) ?? null);
    if (w) renderThread(app, api, w);
    else renderList(app, api);
  },
};
