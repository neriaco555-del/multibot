/**
 * 🎵 Suno MCP — יצירת שירים ומנגינות דרך ה-MCP הרשמי של Suno.
 *
 * חיבור: OAuth חד-פעמי (בלי מפתח API) — מריצים `npm run suno-login`.
 * הטוקן נשמר ב-suno-auth.json ומתחדש אוטומטית.
 *
 * ה-MCP חושף עשרות כלים שהשמות שלהם יכולים להשתנות — לכן המודול מגלה
 * את הכלים בזמן אמת (tools/list), בוחר את כלי היצירה המתאים לפי הסכימה,
 * וממתין לתוצאה עם כלי wait/status. אפשר לעקוף בחירה אוטומטית עם:
 *   SUNO_GENERATE_TOOL / SUNO_WAIT_TOOL / SUNO_MODEL
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.resolve(DIR, config.SUNO_AUTH_FILE || 'suno-auth.json');
const TOOLS_FILE = path.resolve(DIR, 'suno-tools.json');
const MCP_URL = config.SUNO_MCP_URL || 'https://api.suno.com/mcp';
const MCP_ORIGIN = new URL(MCP_URL).origin;
const MCP_PATH = new URL(MCP_URL).pathname || '/mcp';
const DEFAULT_SCOPE = 'api:v0 credits:spend offline_access profile:read library:read library:search library:write download';

export const SUNO_SETUP_HELP =
  `🎵 *יצירת שירים עם Suno — הפעלה חד-פעמית*\n\n` +
  `הבוט צריך התחברות לחשבון Suno (בלי מפתח API).\n` +
  `בשרת מריצים פעם אחת:\n` +
  `\`npm run suno-login\`\n\n` +
  `פותחים את הקישור שמודפס, מתחברים ל-Suno ומאשרים.\n` +
  `אחרי זה אפשר לבקש שיר או מנגינה בשפה חופשית 🎶`;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier() {
  return b64url(crypto.randomBytes(48));
}

function challengeFor(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

function loadAuth() {
  return readJson(AUTH_FILE, null);
}

function saveAuth(auth) {
  writeJson(AUTH_FILE, auth);
  return auth;
}

export function sunoHasAuth() {
  if (config.SUNO_MCP_TOKEN) return true;
  const a = loadAuth();
  return !!(a && (a.access_token || a.refresh_token));
}

export function sunoAuthFile() {
  return AUTH_FILE;
}

async function fetchJson(url, opts = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, headers: res.headers, text, data };
  } finally {
    clearTimeout(t);
  }
}

async function discoverOAuth() {
  if (config.SUNO_OAUTH_AS) {
    const as = config.SUNO_OAUTH_AS.replace(/\/$/, '');
    const meta = await fetchJson(`${as}/.well-known/oauth-authorization-server`);
    if (meta.ok && meta.data) return { resource: MCP_URL, as, meta: meta.data };
  }
  const resourceUrl = `${MCP_ORIGIN}/.well-known/oauth-protected-resource${MCP_PATH === '/' ? '' : MCP_PATH}`;
  const r = await fetchJson(resourceUrl);
  if (!r.ok || !r.data) throw new Error('SUNO_DISCOVERY');
  const as = String((r.data.authorization_servers || [])[0] || '').replace(/\/$/, '');
  if (!as) throw new Error('SUNO_DISCOVERY');
  const m = await fetchJson(`${as}/.well-known/oauth-authorization-server`);
  if (!m.ok || !m.data) throw new Error('SUNO_DISCOVERY');
  return { resource: r.data.resource || MCP_URL, as, meta: m.data };
}

function formBody(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

async function tokenRequest(meta, params) {
  const body = formBody(params);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const clientId = params.client_id;
  const secret = params.client_secret;
  if (secret) {
    headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64');
  }
  const res = await fetchJson(meta.token_endpoint, { method: 'POST', headers, body });
  if (!res.ok || !res.data) {
    const detail = res.data ? JSON.stringify(res.data).slice(0, 200) : res.text.slice(0, 200);
    throw new Error(`SUNO_TOKEN: HTTP ${res.status} ${detail}`);
  }
  return res.data;
}

function tokenFromResponse(tok, prev = {}) {
  const expiresIn = Number(tok.expires_in) || 3600;
  return {
    ...prev,
    token_type: tok.token_type || 'Bearer',
    access_token: tok.access_token || prev.access_token || '',
    refresh_token: tok.refresh_token || prev.refresh_token || '',
    scope: tok.scope || prev.scope || DEFAULT_SCOPE,
    expires_at: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    saved_at: Date.now(),
  };
}

async function refreshAccessToken(auth) {
  if (!auth?.refresh_token) throw new Error('SUNO_AUTH');
  const { meta } = await discoverOAuth();
  const params = {
    grant_type: 'refresh_token',
    refresh_token: auth.refresh_token,
    client_id: auth.client_id,
    resource: MCP_URL,
  };
  if (auth.client_secret) params.client_secret = auth.client_secret;
  const tok = await tokenRequest(meta, params);
  return saveAuth(tokenFromResponse(tok, auth));
}

export async function sunoAccessToken({ force = false } = {}) {
  if (config.SUNO_MCP_TOKEN) return config.SUNO_MCP_TOKEN;
  let auth = loadAuth();
  if (!auth) throw new Error('SUNO_AUTH');
  if (!force && auth.access_token && (!auth.expires_at || auth.expires_at > Date.now() + 60000)) {
    return auth.access_token;
  }
  if (auth.refresh_token) {
    auth = await refreshAccessToken(auth);
    return auth.access_token;
  }
  if (auth.access_token) return auth.access_token;
  throw new Error('SUNO_AUTH');
}

/* ---------------- MCP streamable-HTTP client ---------------- */

function parseSse(text) {
  const out = [];
  for (const block of String(text || '').split(/\r?\n\r?\n/)) {
    let ev = '';
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) ev = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (!data.length) continue;
    const raw = data.join('\n');
    let json = null;
    try { json = JSON.parse(raw); } catch {}
    out.push({ event: ev, raw, json });
  }
  return out;
}

class McpClient {
  constructor(token, refreshFn = null) {
    this.token = token;
    this.refreshFn = refreshFn;
    this.sessionId = '';
    this.protocolVersion = '2025-06-18';
    this.nextId = 1;
  }

  headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.token}`,
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    if (this.protocolVersion) h['MCP-Protocol-Version'] = this.protocolVersion;
    return h;
  }

  async post(payload, timeoutMs = 60000, allowAuthRetry = true) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
      if (res.status === 401) {
        try { await res.body?.cancel(); } catch {}
        if (allowAuthRetry && this.refreshFn) {
          try {
            this.token = await this.refreshFn();
            return await this.post(payload, timeoutMs, false);
          } catch {}
        }
        throw new Error('SUNO_401');
      }
      if (res.status === 403) {
        const text = await res.text().catch(() => '');
        throw new Error(`SUNO_403: ${text.slice(0, 150)}`);
      }
      const ctype = String(res.headers.get('content-type') || '');
      // התראות (ללא id) לא מחכות לתשובה — משחררים את הגוף
      if (res.status === 202 || payload.id === undefined) {
        try { await res.body?.cancel(); } catch {}
        if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
        return null;
      }
      if (ctype.includes('text/event-stream')) {
        if (!res.body) throw new Error('MCP SSE ללא גוף');
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        const wanted = payload.id;
        const events = [];
        let buf = '';
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx;
            while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
              const sep = buf.match(/\r?\n\r?\n/)[0];
              const block = buf.slice(0, idx);
              buf = buf.slice(idx + sep.length);
              const parsed = parseSse(block)[0];
              if (!parsed) continue;
              events.push(parsed);
              if (parsed.json && String(parsed.json.id) === String(wanted)) {
                try { await reader.cancel(); } catch {}
                return parsed.json;
              }
              // הודעת שגיאה/התקדמות בלי id — ממשיכים
            }
          }
          if (buf.trim()) {
            const parsed = parseSse(buf)[0];
            if (parsed) events.push(parsed);
          }
          const match = events.find((e) => e.json && e.json.id !== undefined && String(e.json.id) === String(wanted));
          if (match) return match.json;
          const last = [...events].reverse().find((e) => e.json && e.json.method === undefined);
          if (last) return last.json;
          throw new Error('MCP SSE ללא תשובה');
        } finally {
          try { reader.releaseLock(); } catch {}
        }
      }
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`MCP HTTP ${res.status} ${text.slice(0, 150)}`);
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch {}
      if (!body) throw new Error('MCP תשובה לא תקינה');
      return body;
    } finally {
      clearTimeout(t);
    }
  }

  async connect() {
    const initId = this.nextId++;
    const res = await this.post({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: { name: 'whatsapp-ai-bot', version: '1.0.0' },
      },
    });
    if (!res) throw new Error('MCP initialize ללא תשובה');
    if (res.error) throw new Error(`MCP initialize: ${res.error.message || JSON.stringify(res.error)}`);
    const v = res.result?.protocolVersion;
    if (v) this.protocolVersion = v;
    try {
      await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, 15000);
    } catch {}
    return res.result || {};
  }

  async request(method, params = {}, timeoutMs = 120000) {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params }, timeoutMs);
    if (!res) throw new Error(`MCP ${method}: ללא תשובה`);
    if (res.error) throw new Error(`MCP ${method}: ${res.error.message || JSON.stringify(res.error)}`);
    return res.result;
  }

  async listTools() {
    const out = [];
    let cursor;
    for (let i = 0; i < 10; i++) {
      const r = await this.request('tools/list', cursor ? { cursor } : {});
      if (Array.isArray(r?.tools)) out.push(...r.tools);
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    try {
      writeJson(TOOLS_FILE, { at: Date.now(), tools: out.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    } catch {}
    return out;
  }

  async callTool(name, args, timeoutMs = 180000) {
    const r = await this.request('tools/call', { name, arguments: args || {} }, timeoutMs);
    return toolResult(r);
  }
}

function toolResult(r) {
  const content = Array.isArray(r?.content) ? r.content : [];
  const texts = content.map((c) => (typeof c?.text === 'string' ? c.text : '')).filter(Boolean);
  const links = [];
  for (const c of content) {
    if (typeof c?.resource?.uri === 'string') links.push(c.resource.uri);
    if (typeof c?.uri === 'string') links.push(c.uri);
  }
  let data = r?.structuredContent ?? null;
  if (!data) {
    for (const t of texts) {
      const s = t.trim();
      if (!s || (s[0] !== '{' && s[0] !== '[')) continue;
      try { data = JSON.parse(s); break; } catch {}
    }
  }
  return {
    raw: r,
    data,
    text: [...texts, ...links].join('\n'),
    isError: !!r?.isError,
  };
}

/* ---------------- tool discovery / argument building ---------------- */

const NOT_GENERATE = /(cover|extend|mashup|upload|stem|lyric|persona|voice|speech|remix|remaster|replace|concat|separate|analysis|timeline|download|list|search|delete|playlist|library|favorite|like|create_?persona|create_?custom_?model)/i;

function propsOf(tool) {
  return tool?.inputSchema?.properties && typeof tool.inputSchema.properties === 'object'
    ? tool.inputSchema.properties
    : {};
}

function requiredOf(tool) {
  const r = tool?.inputSchema?.required;
  return Array.isArray(r) ? r : [];
}

function schemaText(tool) {
  try { return JSON.stringify(tool?.inputSchema || {}); } catch { return ''; }
}

function pickGenerateTool(tools, req) {
  if (config.SUNO_GENERATE_TOOL) {
    const forced = tools.find((t) => t.name === config.SUNO_GENERATE_TOOL);
    if (forced) return forced;
  }
  const wantLyrics = !!(req.lyrics && req.lyrics.trim());
  const instrumental = req.kind === 'instrumental';
  const cands = tools.filter((t) => {
    const n = String(t.name || '');
    const d = String(t.description || '');
    const text = `${n} ${d} ${schemaText(t)}`;
    if (NOT_GENERATE.test(n)) return false;
    if (!/generate|create|make|compose/i.test(n + ' ' + d)) return false;
    if (!/song|music|track|clip|audio/i.test(text)) return false;
    // כלי יצירת סאונד/אפקטים/דיבור הם לא שיר
    if (/sfx|sound_?effect/i.test(n)) return false;
    if (/\b(speech|text-to-speech|voiceover|tts|sound effect|sfx)\b/i.test(text) && !/song|music|track/i.test(text)) return false;
    return true;
  });
  const score = (t) => {
    const n = String(t.name || '').toLowerCase();
    const d = String(t.description || '').toLowerCase();
    const props = propsOf(t);
    const keys = Object.keys(props).map((k) => k.toLowerCase());
    let s = 0;
    if (n.includes('custom')) s += wantLyrics ? 6 : -3;
    if (n.includes('inspiration') || n.includes('description') || n.includes('prompt') || n.includes('idea')) s += wantLyrics ? 0 : 3;
    if (keys.some((k) => /lyrics?/.test(k))) s += wantLyrics ? 5 : -1;
    if (keys.some((k) => /style|tags?|genre/.test(k))) s += 1;
    if (keys.some((k) => /instrumental|no_?vocals/.test(k))) s += instrumental ? 4 : 0;
    if (n.includes('instrumental')) s += instrumental ? 6 : -3;
    if (d.includes('instrumental')) s += instrumental ? 2 : 0;
    if (keys.some((k) => /prompt|description/.test(k))) s += wantLyrics ? 1 : 2;
    if (n.includes('lyrics') && !keys.some((k) => /lyrics?/.test(k))) s -= 5;
    return s;
  };
  cands.sort((a, b) => score(b) - score(a));
  return cands[0] || null;
}

function buildArgs(tool, req) {
  const props = propsOf(tool);
  const keys = Object.keys(props);
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(props, k);
  const set = (k, v) => {
    if (!has(k)) return;
    if (v === undefined || v === null || v === '') return;
    out[k] = v;
  };
  const isInstrumental = req.kind === 'instrumental';
  const promptText = (req.prompt || '').trim();
  const styleText = (req.style || '').trim();
  const lyrics = (req.lyrics || '').trim();
  const hasLyricsProp = keys.some((k) => /lyrics?/i.test(k) || /custom_?lyrics/i.test(k));

  for (const key of keys) {
    const n = key.toLowerCase();
    const p = props[key] || {};
    const type = String(p.type || '');
    if (/negative/.test(n)) continue;
    if (/lyrics?$/.test(n) || /custom_?lyrics/.test(n)) {
      set(key, lyrics || (isInstrumental ? undefined : promptText) || undefined);
    } else if (/style|genre/.test(n) || (/tags?/.test(n) && !/negative/.test(n))) {
      set(key, styleText || undefined);
    } else if (/title|song_?name/.test(n) || n === 'name') {
      set(key, (req.title || '').trim() || undefined);
    } else if (/prompt|description|idea|concept|about|topic/.test(n)) {
      const pv = isInstrumental
        ? (promptText || styleText || 'instrumental music')
        : (lyrics && !hasLyricsProp
          ? lyrics
          : (lyrics ? (styleText || promptText || 'song') : (promptText || styleText || 'song')));
      set(key, pv);
    } else if (/instrumental|no_?vocals|make_?instrumental/.test(n)) {
      set(key, isInstrumental);
    } else if (/clip_?count|num_?clips|number_?of_?clips|variations|num_?variations/.test(n)) {
      set(key, 1);
    } else if (/custom_?mode/.test(n)) {
      set(key, !!lyrics);
    } else if (/model|model_?version|^mv$/.test(n)) {
      if (config.SUNO_MODEL) set(key, config.SUNO_MODEL);
    } else if (/duration|length|seconds|target_?duration/.test(n)) {
      if (req.durationSec) set(key, req.durationSec);
    } else if (type === 'boolean' && /wait|async/.test(n)) {
      set(key, true);
    }
  }

  // שדות חובה שלא מולאו — נותנים ערך סביר כדי לא ליפול על validation
  for (const key of requiredOf(tool)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;
    const p = props[key] || {};
    const n = key.toLowerCase();
    const type = String(p.type || (Array.isArray(p.anyOf) ? 'string' : ''));
    if (/instrumental|no_?vocals|make_?instrumental/.test(n)) out[key] = isInstrumental;
    else if (/lyrics?|custom_?lyrics/.test(n)) out[key] = lyrics || promptText || (isInstrumental ? ' ' : 'la la la');
    else if (/style|genre|tags?/.test(n)) out[key] = styleText || (isInstrumental ? 'instrumental' : 'pop');
    else if (/title/.test(n)) out[key] = (req.title || '').trim() || 'AI Song';
    else if (/clip_?count|num_?clips|count|variations/.test(n)) out[key] = 1;
    else if (/duration|length|seconds/.test(n)) out[key] = req.durationSec || 120;
    else if (/prompt|description|idea|topic/.test(n)) out[key] = promptText || styleText || (isInstrumental ? 'instrumental music' : 'song');
    else if (type === 'boolean') out[key] = isInstrumental ? true : false;
    else if (type === 'number' || type === 'integer') out[key] = 1;
    else if (type === 'array') out[key] = [];
    else out[key] = promptText || styleText || (isInstrumental ? 'instrumental' : 'song');
  }

  if (!keys.length) {
    Object.assign(out, {
      prompt: isInstrumental ? (promptText || styleText || 'instrumental music') : (promptText || styleText || 'song'),
      style: styleText || undefined,
      title: (req.title || '').trim() || undefined,
      lyrics: lyrics || undefined,
      instrumental: isInstrumental,
      clip_count: 1,
      custom_mode: !!lyrics,
    });
  }
  return out;
}

/* ---------------- result parsing ---------------- */

const AUDIO_EXT_RE = /\.(mp3|wav|m4a|ogg|flac|aac)(\?|#|$)/i;
const AUDIO_KEY_RE = /^(audio_?url|audio|mp3_?url|mp3|wav_?url|wav|download_?url|file_?url)$/i;

function walk(value, visit, depth = 0, key = '', parent = null) {
  if (depth > 14 || value === null || value === undefined) return;
  visit(value, key, parent);
  if (Array.isArray(value)) {
    for (const v of value) walk(v, visit, depth + 1, key, parent);
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, visit, depth + 1, k, value);
  }
}

function collectAudioUrls(data, text = '') {
  const urls = [];
  const add = (u, byKey = false) => {
    if (typeof u !== 'string') return;
    const s = u.trim();
    if (!/^https?:\/\//i.test(s)) return;
    if (!byKey && !AUDIO_EXT_RE.test(s)) return;
    if (!urls.includes(s)) urls.push(s);
  };
  walk(data, (v, k) => {
    if (typeof v === 'string') {
      if (AUDIO_KEY_RE.test(k)) add(v, true);
      else if (AUDIO_EXT_RE.test(v)) add(v);
      // markdown links
      for (const m of v.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) add(m[1]);
    }
  });
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) add(m[0]);
  urls.sort((a, b) => {
    const am = /\.mp3/i.test(a) ? 0 : /\.m4a/i.test(a) ? 1 : /\.wav/i.test(a) ? 2 : 3;
    const bm = /\.mp3/i.test(b) ? 0 : /\.m4a/i.test(b) ? 1 : /\.wav/i.test(b) ? 2 : 3;
    return am - bm;
  });
  return urls;
}

function collectIds(data, text = '') {
  const ids = [];
  const add = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
    if (typeof v !== 'string') return;
    const s = v.trim();
    if (!s || s.length > 120) return;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-]{5,}$/.test(s)) return;
    if (!ids.includes(s)) ids.push(s);
  };
  const ID_KEY_RE = /^(generation_?id|generation_?ids|task_?id|task_?ids|job_?id|job_?ids|clip_?id|clip_?ids|song_?id|song_?ids|music_?id|music_?ids|ids?)$/i;
  const PARENT_HINT_RE = /generation|clip|song|track|music|task|job|status|audio|title/i;
  walk(data, (v, k, parent) => {
    if (ID_KEY_RE.test(k)) {
      if (Array.isArray(v)) v.forEach(add);
      else add(v);
    } else if (k === 'id' && parent && typeof parent === 'object') {
      try {
        if (Object.keys(parent).some((x) => x !== 'id' && PARENT_HINT_RE.test(x))) add(v);
      } catch {}
    }
  });
  for (const m of String(text || '').matchAll(/\b(?:generation|task|job|clip|song|music)[\s_-]?id["'\s:=-]+([a-zA-Z0-9][a-zA-Z0-9_\-]{5,})/gi)) add(m[1]);
  return ids;
}

function findDuration(data) {
  let dur = 0;
  walk(data, (v, k) => {
    if (dur) return;
    if (/^(duration|duration_?seconds|length|length_?seconds|audio_?length)$/i.test(k)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) dur = n;
    }
  });
  return dur;
}

function findTitle(data) {
  let title = '';
  walk(data, (v, k) => {
    if (title) return;
    if (/^(title|song_?title|track_?title)$/i.test(k) && typeof v === 'string' && v.trim() && !/^https?:/i.test(v)) {
      title = v.trim().slice(0, 120);
    }
  });
  if (!title) {
    walk(data, (v, k) => {
      if (title) return;
      if (k === 'name' && typeof v === 'string' && v.trim() && !/^https?:/i.test(v)) title = v.trim().slice(0, 120);
    });
  }
  return title;
}

function statusOf(data) {
  let status = '';
  walk(data, (v, k) => {
    if (status) return;
    if (/^(status|state|generation_?status|task_?status)$/i.test(k) && typeof v === 'string') status = v.toLowerCase();
  });
  return status;
}

function hasFinalAudio(data, text) {
  if (!collectAudioUrls(data, text).length) return false;
  const s = statusOf(data);
  if (!s) return true;
  return /complete|completed|success|succeed|ready|done|finished|finished_?success/i.test(s);
}

function buildLookupArgs(tool, ids, data) {
  const props = propsOf(tool);
  const keys = Object.keys(props);
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(props, k);
  const first = ids[0];
  const all = ids;
  for (const key of keys) {
    const n = key.toLowerCase();
    const p = props[key] || {};
    const type = String(p.type || (Array.isArray(p.anyOf) ? (p.anyOf[0]?.type || '') : ''));
    if (/ids$|clip_?ids|song_?ids|generation_?ids/.test(n)) {
      out[key] = type === 'array' ? all : all.join(',');
    } else if (/id$|uuid|clip|generation|task|job|song/.test(n) && !/user|playlist/.test(n)) {
      out[key] = first;
    } else if (/wait|timeout|max_?wait/.test(n)) {
      out[key] = Math.min(300, Math.max(30, Math.round((config.SUNO_TIMEOUT_MS || 480000) / 1000)));
    } else if (/include|full|details/.test(n) && type === 'boolean') {
      out[key] = true;
    }
  }
  for (const key of requiredOf(tool)) {
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;
    const p = props[key] || {};
    const type = String(p.type || '');
    if (/ids$/.test(key.toLowerCase())) out[key] = type === 'array' ? all : all.join(',');
    else if (/id$|uuid/.test(key.toLowerCase())) out[key] = first;
    else if (type === 'number' || type === 'integer') out[key] = 1;
    else if (type === 'boolean') out[key] = true;
    else if (type === 'array') out[key] = all;
    else out[key] = first;
  }
  // אם אין שדות בכלל — שולחים מגוון שמות נפוצים רק אם הם בסכימה
  if (!keys.length) {
    if (has('id')) out.id = first;
    if (has('generation_id')) out.generation_id = first;
    if (has('task_id')) out.task_id = first;
    if (has('clip_ids')) out.clip_ids = all;
  }
  return out;
}

function pickWaitTools(tools) {
  const forced = config.SUNO_WAIT_TOOL ? tools.filter((t) => t.name === config.SUNO_WAIT_TOOL) : [];
  if (forced.length) return forced;
  const isLookup = (t) => {
    const n = String(t.name || '').toLowerCase();
    const d = String(t.description || '').toLowerCase();
    const keys = Object.keys(propsOf(t)).map((k) => k.toLowerCase());
    const hasId = keys.some((k) => /(^|_)(id|ids|uuid|clip|generation|task|job|song)/.test(k));
    if (!hasId) return false;
    if (/generate|create|make|compose|cover|extend|mashup|upload|remaster|replace/i.test(n)) return false;
    if (/credits|profile|plan|models|voices|playlist|search|library_?list|recent/.test(n)) return false;
    if (/wait|poll|status|check|get|fetch|info|details|result/i.test(n + ' ' + d)) return true;
    return false;
  };
  return tools
    .filter(isLookup)
    .sort((a, b) => {
      const score = (t) => {
        const n = String(t.name || '').toLowerCase();
        let s = 0;
        if (n.includes('wait')) s += 10;
        if (n.includes('generation')) s += 4;
        if (n.includes('song') || n.includes('music') || n.includes('track')) s += 3;
        if (n.includes('status')) s += 3;
        if (n.includes('clip')) s += 2;
        return s;
      };
      return score(b) - score(a);
    })
    .slice(0, 4);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForAudio(client, tools, first, req, opts = {}) {
  const deadline = Date.now() + (opts.timeoutMs || config.SUNO_TIMEOUT_MS || 8 * 60 * 1000);
  let last = first;
  let ids = collectIds(first.data, first.text);
  if (hasFinalAudio(first.data, first.text)) return first;

  const waitTools = pickWaitTools(tools);
  if (!waitTools.length && ids.length) {
    // אין כלי wait — מנסים כלי get/status כלשהם עם id
    const fallback = tools.filter((t) => {
      const n = String(t.name || '').toLowerCase();
      const keys = Object.keys(propsOf(t)).map((k) => k.toLowerCase());
      return keys.some((k) => /(^|_)(id|ids|uuid|generation|task|clip|song)/.test(k)) &&
        !/credits|profile|plan|delete|search|library|playlist|voices|upload|create|generate|cover|extend|mashup|remaster|replace/.test(n);
    });
    waitTools.push(...fallback.slice(0, 3));
  }

  if (!waitTools.length) return first;
  if (!ids.length) return first;

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    for (const tool of waitTools) {
      const args = buildLookupArgs(tool, ids, last.data);
      if (!Object.keys(args).length) continue;
      try {
        const r = await client.callTool(tool.name, args, Math.max(30000, deadline - Date.now()));
        last = r;
        if (r.isError) {
          console.warn(`suno wait tool ${tool.name} error: ${r.text.slice(0, 160)}`);
          continue;
        }
        const found = collectIds(r.data, r.text);
        if (found.length) ids = [...new Set([...ids, ...found])];
        if (hasFinalAudio(r.data, r.text)) return r;
        if (collectAudioUrls(r.data, r.text).length) return r;
      } catch (e) {
        console.warn(`suno wait tool ${tool.name} fail: ${(e && e.message || '').slice(0, 160)}`);
      }
    }
    if (opts.onStatus) {
      try { opts.onStatus({ attempt, status: statusOf(last.data), ids }); } catch {}
    }
    await sleep(attempt <= 3 ? 5000 : 9000);
  }
  return last;
}

function isMp3(buf) {
  return buf && (buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
}

async function maybeMp3(buf, url) {
  if (!buf || isMp3(buf)) return buf;
  const looksLossless = /\.(wav|flac|ogg|m4a|aac)(\?|$)/i.test(url) || (buf[0] === 0x52 && buf[1] === 0x49);
  if (!looksLossless) return buf;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'suno-'));
  try {
    const inp = path.join(dir, 'in.audio');
    const out = path.join(dir, 'out.mp3');
    await fs.promises.writeFile(inp, buf);
    await execFileAsync('ffmpeg', ['-y', '-i', inp, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', out]);
    const mp3 = await fs.promises.readFile(out);
    return mp3.length > 5000 ? mp3 : buf;
  } catch {
    return buf;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadAudio(url, token) {
  const tryFetch = async (withAuth) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 180000);
    try {
      const headers = withAuth ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(url, { headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ctype = String(res.headers.get('content-type') || '');
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length < 5000) throw new Error('קובץ ריק');
      if (/json|text\/html/i.test(ctype) || buf.subarray(0, 1).toString() === '{') throw new Error('תוכן לא אודיו');
      return buf;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return await tryFetch(false);
  } catch (e) {
    try {
      return await tryFetch(true);
    } catch (e2) {
      throw new Error(`SUNO_DOWNLOAD: ${(e2 && e2.message) || (e && e.message) || 'failed'}`);
    }
  }
}

/* ---------------- public generation API ---------------- */

async function toEnglishSafe(text) {
  const s = String(text || '').trim();
  if (!s || !/[\u0590-\u05FF]/.test(s)) return s;
  try {
    const { translateText } = await import('./web-search.js');
    const out = await Promise.race([
      translateText(s.slice(0, 500), 'en'),
      new Promise((r) => setTimeout(() => r(''), 5000)),
    ]);
    return out || s;
  } catch {
    return s;
  }
}

export async function sunoGenerate(req = {}, opts = {}) {
  if (!sunoHasAuth()) throw new Error('SUNO_AUTH');
  const token = await sunoAccessToken();
  // סגנון/תיאור קצר עדיף באנגלית ב-Suno; המילים עצמן נשארות בשפת המשתמש
  const work = { ...req };
  if (work.style) work.style = await toEnglishSafe(work.style);
  if (work.prompt && work.prompt.length <= 500) work.prompt = await toEnglishSafe(work.prompt);
  req = work;
  const refreshFn = config.SUNO_MCP_TOKEN ? null : async () => {
    const auth = loadAuth();
    if (!auth?.refresh_token) throw new Error('SUNO_AUTH');
    const fresh = await refreshAccessToken(auth);
    return fresh.access_token;
  };
  const client = new McpClient(token, refreshFn);
  let connected = false;
  try {
    try {
      await client.connect();
      connected = true;
    } catch (e) {
      if (!/SUNO_401/.test(e.message)) throw e;
      // טוקן פג — מרעננים ומנסים שוב
      if (config.SUNO_MCP_TOKEN) throw new Error('SUNO_AUTH');
      const auth = loadAuth();
      if (!auth?.refresh_token) throw new Error('SUNO_AUTH');
      const fresh = await refreshAccessToken(auth);
      client.token = fresh.access_token;
      await client.connect();
      connected = true;
    }

    const tools = await client.listTools();
    const tool = pickGenerateTool(tools, req);
    if (!tool) {
      const names = tools.map((t) => t.name).slice(0, 60).join(', ');
      throw new Error(`SUNO_TOOL: לא נמצא כלי יצירת שיר (${names.slice(0, 300)})`);
    }
    const args = buildArgs(tool, req);
    console.log(`🎵 Suno MCP → ${tool.name} ${JSON.stringify(args).slice(0, 500)}`);
    let first = await client.callTool(tool.name, args, Math.max(120000, config.SUNO_TIMEOUT_MS || 480000));
    if (first.isError) throw new Error(`SUNO_TOOL: ${first.text.slice(0, 240) || 'generation failed'}`);

    const final = await waitForAudio(client, tools, first, req, opts);
    const urls = collectAudioUrls(final.data, final.text);
    if (!urls.length) {
      const preview = (final.text || JSON.stringify(final.data || {})).slice(0, 300);
      throw new Error(`SUNO_NO_AUDIO: ${preview || 'לא התקבל קישור אודיו'}`);
    }
    const url = urls[0];
    let buffer = null;
    let downloadError = '';
    if (!opts.noDownload) {
      try {
        buffer = await maybeMp3(await downloadAudio(url, token), url);
      } catch (e) {
        downloadError = (e && e.message) || 'download failed';
        console.warn('suno download fail:', downloadError.slice(0, 160));
      }
    }
    return {
      buffer,
      url,
      downloadError,
      title: findTitle(final.data) || req.title || '',
      duration: findDuration(final.data) || 0,
      status: statusOf(final.data) || 'complete',
      tool: tool.name,
    };
  } finally {
    // סגירת סשן אופציונלית — אם קיים, לא חובה
    if (connected && client.sessionId) {
      try {
        await fetch(MCP_URL, { method: 'DELETE', headers: client.headers() }).catch(() => {});
      } catch {}
    }
  }
}

/* ---------------- OAuth login ---------------- */

export async function sunoLogin({ redirectPort = Number(config.SUNO_OAUTH_PORT) || 53682, timeoutMs = 10 * 60 * 1000, onUrl } = {}) {
  const { resource, meta } = await discoverOAuth();
  const redirectUri = `http://127.0.0.1:${redirectPort}/callback`;
  const scope = config.SUNO_SCOPE || DEFAULT_SCOPE;

  const reg = await fetchJson(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'WhatsApp AI Bot',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope,
    }),
  });
  if (!reg.ok || !reg.data?.client_id) {
    throw new Error(`SUNO_REGISTER: HTTP ${reg.status} ${reg.text.slice(0, 200)}`);
  }
  const clientId = reg.data.client_id;
  const clientSecret = reg.data.client_secret || '';
  const verifier = randomVerifier();
  const challenge = challengeFor(verifier);
  const state = b64url(crypto.randomBytes(18));
  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('resource', resource);

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((res, rej) => { resolveCode = res; rejectCode = rej; });
  let server = null;
  const http = await import('node:http');
  const serverPromise = new Promise((resolve) => {
    server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, redirectUri);
        if (u.pathname !== '/callback') {
          res.writeHead(404).end('Not found');
          return;
        }
        const err = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        const gotState = u.searchParams.get('state');
        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>ההתחברות נכשלה</h1><p>אפשר לסגור את החלון ולנסות שוב.</p>');
          rejectCode(new Error(`SUNO_OAUTH: ${err} ${u.searchParams.get('error_description') || ''}`));
          resolve();
          return;
        }
        if (!code || gotState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>תשובה לא תקינה</h1>');
          rejectCode(new Error('SUNO_OAUTH: state/code לא תקין'));
          resolve();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>התחברת בהצלחה ל-Suno ✅</h1><p>אפשר לחזור לטרמינל ולסגור את החלון.</p>');
        resolveCode(code);
        resolve();
      } catch (e) {
        try { res.writeHead(500).end('error'); } catch {}
        rejectCode(e);
        resolve();
      }
    });
    server.on('error', (e) => {
      rejectCode(e);
      resolve();
    });
    server.listen(redirectPort, '127.0.0.1', () => resolve('listening'));
  });

  const url = authUrl.toString();
  if (onUrl) { try { onUrl(url); } catch {} }
  console.log('\n🔗 פתח את הקישור הזה בדפדפן והתחבר לחשבון Suno:\n');
  console.log(url);
  console.log('\n(אם הבוט על שרת בלי דפדפן — אפשר להעתיק את הקישור לדפדפן במחשב, ואז להעתיק לכאן את כתובת ה-callback המלאה.)\n');
  try {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const openArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    execFile(opener, openArgs, () => {});
  } catch {}

  let stdinCode = null;
  if (process.stdin.isTTY) {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (line) => {
      const t = String(line || '').trim();
      if (!t) return;
      try {
        const u = new URL(t);
        const code = u.searchParams.get('code');
        if (code) stdinCode = code;
      } catch {
        if (/^[a-zA-Z0-9._~-]{10,}$/.test(t)) stdinCode = t;
      }
      if (stdinCode) { try { rl.close(); } catch {} resolveCode(stdinCode); }
    });
    codePromise.then(() => { try { rl.close(); } catch {} }, () => { try { rl.close(); } catch {} });
  }

  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('SUNO_OAUTH_TIMEOUT')), timeoutMs));
  let code;
  try {
    code = await Promise.race([codePromise, timeout]);
  } finally {
    try { server?.close(); } catch {}
  }

  const params = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource,
  };
  if (clientSecret) params.client_secret = clientSecret;
  const tok = await tokenRequest(meta, params);
  const auth = saveAuth(tokenFromResponse(tok, {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    authorization_server: meta.issuer || '',
    resource,
  }));

  // בדיקה שהחיבור עובד — וכתיבת רשימת הכלים לקובץ עזר
  try {
    const client = new McpClient(auth.access_token);
    await client.connect();
    const tools = await client.listTools();
    console.log(`\n✅ מחובר ל-Suno MCP. נמצאו ${tools.length} כלים.`);
    console.log('כלי יצירה שזוהו:', tools.map((t) => t.name).filter((n) => /generate|create/i.test(n)).join(', ') || 'לא זוהו — הבוט ינסה אוטומטית בזמן אמת');
    console.log(`📄 רשימת הכלים נשמרה ב-${TOOLS_FILE}`);
  } catch (e) {
    console.warn('⚠️ ההתחברות נשמרה, אבל בדיקת ה-MCP נכשלה:', (e && e.message || '').slice(0, 200));
  }
  return auth;
}
