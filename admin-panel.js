/**
 * 🖥️ פאנל ניהול לבוט — http://localhost:3877 (טוקן ב-.env: ADMIN_TOKEN).
 * קריאה/כתיבה ישירה ל-bot-store.json (תצוגה) + פקודות דרך admin-ops.json (הבוט מיישם כל דקה).
 * האזנה ל-localhost בלבד.
 */
import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import { exec } from 'node:child_process';

const PORT = Number(process.env.ADMIN_PORT || 3877);
const HOST = process.env.ADMIN_HOST || '127.0.0.1'; // 0.0.0.0 = גישה מהרשת הביתית (לאפליקציה)
const TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const DIR = new URL('./', import.meta.url);
const STORE = new URL('./bot-store.json', import.meta.url);
const OPS = new URL('./admin-ops.json', import.meta.url);
const ENVF = new URL('./.env', import.meta.url);

const TOGGLES = [
  ['antilink', '🔗 הסרת קישורים (3 = העפה)'],
  ['linkAllowInfo', null],
  ['antispam', '🌊 אנטי-ספאם קשוח'],
  ['anticurse', '🤬 סינון קללות'],
  ['welcome', '👋 ברוכים הבאים'],
  ['autoSticker', '⭐ אוטו-סטיקר'],
  ['autoTranslate', '🌐 תרגום אוטומטי'],
  ['morning', '🌅 בוקר-טוב יומי'],
  ['rates', '💹 שערים יומיים'],
  ['brief', '📰 בריף בוקר'],
];

function store() {
  try {
    return JSON.parse(fs.readFileSync(STORE, 'utf-8'));
  } catch {
    return { groups: {}, chatLog: {} };
  }
}
function allowedGroups() {
  try {
    const env = fs.readFileSync(ENVF, 'utf-8');
    const m = env.match(/^ALLOWED_GROUPS=(.*)$/m);
    return (m ? m[1] : '').split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
function send(res, code, obj, type = 'application/json') {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(body);
}
function auth(req, url) {
  if (!TOKEN) return false;
  if (req.headers['x-token'] === TOKEN) return true;
  return url.searchParams.get('token') === TOKEN;
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 200000) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); }
    });
  });
}
function pushOp(op) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(OPS, 'utf-8')) || []; } catch {}
  if (!Array.isArray(arr)) arr = [];
  arr.push({ ...op, at: Date.now() });
  fs.writeFileSync(OPS, JSON.stringify(arr.slice(-50)));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    if (!auth(req, url)) return send(res, 401, 'nope');
    return send(res, 200, PAGE.replaceAll('__TOKEN__', TOKEN), 'text/html');
  }
  if (!url.pathname.startsWith('/api/')) return send(res, 404, { ok: false });
  if (!auth(req, url)) return send(res, 401, { ok: false, error: 'auth' });

  if (url.pathname === '/api/state') {
    const s = store();
    const allowed = allowedGroups();
    const merged = {};
    for (const [jid, g] of Object.entries(s.groups || {})) {
      if (!jid.endsWith('@g.us')) continue; // רק קבוצות — בלי צ'אטים פרטיים
      merged[jid] = g;
    }
    const liveSet = new Set(Object.keys(s.knownGroups || {}));
    for (const [jid, k] of Object.entries(s.knownGroups || {})) {
      if (!merged[jid]) {
        merged[jid] = { subject: k.subject || '', toggles: {}, linkAllow: [], warns: {}, muted: [], rules: '', welcomeText: '' };
      } else if (!merged[jid].subject && k.subject) {
        merged[jid] = { ...merged[jid], subject: k.subject };
      }
    }
    const groups = Object.entries(merged).map(([jid, g]) => {
      const log = (s.chatLog && s.chatLog[jid]) || [];
      const lastName = log.length ? (log[log.length - 1].name || '') : '';
      return {
        jid,
        subject: g.subject || '',
        name: lastName,
        live: liveSet.has(jid),
        toggles: g.toggles || {},
        linkAllow: g.linkAllow || [],
        warns: g.warns || {},
        warnsCount: Object.keys(g.warns || {}).length,
        muted: g.muted || [],
        rules: g.rules || '',
        features: g.features || {},
        welcomeText: g.welcomeText || '',
        msgs: log.length,
        lastMsg: log.length ? log[log.length - 1].time : 0,
      };
    }).sort((a, b) => b.lastMsg - a.lastMsg);
    const knownGroups = Object.entries(s.knownGroups || {}).map(([jid, k]) => ({
      jid,
      subject: k.subject || '',
      at: k.at || 0,
      allowed: allowed.length === 0 || allowed.includes(jid),
    })).sort((a, b) => String(a.subject).localeCompare(String(b.subject), 'he'));
    const seenJids = new Set();
    const privates = [];
    for (const [jid, log] of Object.entries(s.chatLog || {})) {
      if (jid.endsWith('@g.us')) continue;
      seenJids.add(jid);
      const last = (log || []).slice(-1)[0] || {};
      const g = (s.groups || {})[jid] || {};
      privates.push({
        jid,
        name: last.name || (g.names && Object.values(g.names)[0]) || '',
        msgs: (log || []).length,
        lastMsg: last.time || 0,
        muted: !!(g.botMutedUntil && g.botMutedUntil > Date.now()),
      });
    }
    // צ'אטים בלי הודעות טקסט (מדיה בלבד) — מהשמות השמורים
    for (const [jid, g] of Object.entries(s.groups || {})) {
      if (jid.endsWith('@g.us') || seenJids.has(jid)) continue;
      const names = Object.values(g.names || {});
      privates.push({
        jid,
        name: names[0] || '',
        msgs: 0,
        lastMsg: 0,
        muted: !!(g.botMutedUntil && g.botMutedUntil > Date.now()),
      });
    }
    privates.sort((a, b) => b.lastMsg - a.lastMsg);
    return send(res, 200, { ok: true, groups, knownGroups, privates, allowedGroups: allowed, now: Date.now() });
  }

  if (url.pathname === '/api/op' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.op || !b.jid) return send(res, 400, { ok: false, error: 'op+jid' });
    pushOp(b);
    return send(res, 200, { ok: true, note: 'יישום עד דקה' });
  }

  if (url.pathname === '/api/allowed' && req.method === 'POST') {
    const b = await readBody(req);
    const jid = String(b.jid || '').trim();
    if (!jid) return send(res, 400, { ok: false });
    let env = fs.readFileSync(ENVF, 'utf-8');
    const m = env.match(/^ALLOWED_GROUPS=(.*)$/m);
    let list = (m ? m[1] : '').split(',').map((x) => x.trim()).filter(Boolean);
    if (b.action === 'add' && !list.includes(jid)) list.push(jid);
    if (b.action === 'remove') list = list.filter((x) => x !== jid);
    env = env.replace(/^ALLOWED_GROUPS=.*$/m, `ALLOWED_GROUPS=${list.join(',')}`);
    fs.writeFileSync(ENVF, env);
    exec('systemctl --user restart whatsapp-ai-bot.service');
    return send(res, 200, { ok: true, allowedGroups: list, note: 'הבוט מופעל מחדש' });
  }

  if (url.pathname === '/api/logs') {
    exec('journalctl --user -u whatsapp-ai-bot.service --since "30 min ago" --no-pager 2>&1 | tail -60', (e, out) => {
      send(res, 200, { ok: true, logs: String(out || '').slice(-8000) }, 'application/json');
    });
    return;
  }

  if (url.pathname === '/api/restart' && req.method === 'POST') {
    exec('systemctl --user restart whatsapp-ai-bot.service');
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { ok: false });
});

server.listen(PORT, HOST, () => {
  console.log(`🖥️ admin panel: http://${HOST}:${PORT}/?token=${TOKEN ? '***' : 'NOT-SET'}`);
});

const PAGE = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ניהול הבוט 🤖</title>
<style>
body{font-family:system-ui;background:#0f1419;color:#e7e9ea;margin:0;padding:16px}
h1{font-size:20px}h2{font-size:16px;margin:18px 0 8px;color:#1d9bf0}
.card{background:#15202b;border-radius:12px;padding:12px;margin:8px 0}
select,input[type=text]{width:100%;padding:8px;margin:4px 0;border-radius:8px;border:1px solid #333;background:#0f1419;color:#e7e9ea}
button{background:#1d9bf0;color:#fff;border:0;border-radius:8px;padding:8px 14px;margin:4px;cursor:pointer}
button.red{background:#f4212e}button.green{background:#00ba7c}button.gray{background:#333}
.row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #222}
.switch{transform:scale(1.4)}
.small{font-size:12px;color:#8899a6}.mono{font-family:monospace;font-size:12px}
pre{background:#000;padding:8px;border-radius:8px;max-height:220px;overflow:auto;font-size:11px;direction:ltr;text-align:left}
.warn{background:#2a1500;border-radius:8px;padding:6px;margin:4px 0;font-size:13px}
</style></head><body>
<h1>🤖 ניהול הבוט</h1>
<div class="card"><label>קבוצה:</label><select id="g"></select>
<div class="small" id="ginfo"></div></div>
<div class="card"><h2>🛡️ מסננים</h2><div id="toggles"></div>
<label>🔗 דומיינים מותרים (פסיקים):</label><input type="text" id="linkAllow" dir="ltr" placeholder="youtube.com, facebook.com">
<button onclick="saveLinkAllow()">שמור דומיינים</button></div>
<div class="card"><h2>🧩 פיצ׳רים (וי = פעיל)</h2><div id="features"></div>
<div class="row"><button class="green" onclick="featuresAll(true)">הכל פעיל ✅</button><button class="red" onclick="featuresAll(false)">הכל כבוי</button></div></div>
<div class="card"><h2>⚠️ אזהרות (<span id="wcount">0</span>)</h2><div id="warns"></div>
<button class="red" onclick="op({op:'clearWarns'},'נוקו כל האזהרות')">נקה הכל</button></div>
<div class="card"><h2>🔇 מושתקים</h2><div id="muted"></div>
<input type="text" id="muteUser" dir="ltr" placeholder="user@lid / phone@s.whatsapp.net">
<button onclick="op({op:'mute',user:v('muteUser')},'הושתק')">השתק</button>
<button onclick="op({op:'unmute',user:v('muteUser')},'שוחרר')">שחרר</button></div>
<div class="card"><h2>📜 חוקים + 👋 ברוכים</h2>
<input type="text" id="rules" placeholder="חוקי הקבוצה...">
<button onclick="op({op:'rules',text:v('rules')},'נשמר')">שמור חוקים</button>
<input type="text" id="welcome" placeholder="הודעת ברוכים הבאים...">
<button onclick="op({op:'welcome',text:v('welcome')},'נשמר')">שמור ברכה</button></div>
<div class="card"><h2>💬 צ׳אטים פרטיים — כיבוי/הדלקה</h2><input type="text" id="psearch" placeholder="חיפוש שם/מספר..." oninput="renderPrivates()"><div id="privates"></div></div>
<div class="card"><h2>👥 קבוצות מורשות</h2>
<div class="small">כל הקבוצות שהבוט חבר בהן (נסרק אוטומטית) — אישור בלחיצה, בלי להעתיק מזהים:</div>
<div id="known"></div>
<div class="small">הוספה ידנית:</div>
<input type="text" id="newGroup" dir="ltr" placeholder="1203...@g.us">
<button class="green" onclick="allowed('add')">הוסף + הפעל מחדש</button>
<div id="allowed"></div></div>
<div class="card"><h2>📋 לוג</h2><button onclick="logs()">רענן</button>
<button class="gray" onclick="restart()">הפעל בוט מחדש</button><pre id="log"></pre></div>
<script>
const T='__TOKEN__';
const api=(p,o)=>fetch(p+(p.includes('?')?'&':'?')+'token='+T,o).then(r=>r.json());
const v=id=>document.getElementById(id).value.trim();
let S=null,cur=null;
const TOGGLES=[['antilink','🔗 הסרת קישורים (3=העפה)'],['antispam','🌊 אנטי-ספאם'],['anticurse','🤬 קללות'],['welcome','👋 ברוכים'],['autoSticker','⭐ אוטו-סטיקר'],['autoTranslate','🌐 תרגום'],['morning','🌅 בוקר-טוב'],['rates','💹 שערים'],['brief','📰 בריף']];
const FEATURES=[['chat','💬 צ׳אט AI'],['image','🎨 תמונות'],['song','🎵 שירים'],['video','🎬 חיפוש סרטונים'],['sticker','⭐ סטיקרים'],['tts','🔊 הקראה ותמלול'],['info','🌤️ מידע'],['qr','🔳 ברקוד'],['games','🎮 משחקים'],['fun','😂 כיף'],['bg','🖼️ רקעים'],['site','🌐 אתרים'],['tools','⏰ כלי קבוצה'],['shop','🛒 קניות']];
async function load(){S=await api('/api/state');const g=document.getElementById('g');
g.innerHTML=S.groups.map(x=>'<option value="'+x.jid+'">'+(x.live?'🟢 ':'⚪ ')+esc(x.subject||x.name||x.jid)+' ('+x.msgs+')</option>').join('');
if(!cur&&S.groups[0])cur=S.groups[0].jid;g.value=cur;render();
const a=document.getElementById('allowed');
a.innerHTML=(S.knownGroups||[]).map(k=>'<div class="row"><span>'+esc(k.subject||k.jid)+'<br><span class="mono">'+k.jid+'</span></span>'+(k.allowed?'<button class="red" onclick="allowed(\\'remove\\',\\''+k.jid+'\\')">הסר</button>':'<button class="green" onclick="allowed(\\'add\\',\\''+k.jid+'\\')">אשר ✅</button>')+'</div>').join('')||'<span class="small">אין עדיין (סריקה פעם בשעה)</span>';
a.innerHTML+='<div class="small">ידני ('+S.allowedGroups.length+'):</div>'+S.allowedGroups.filter(j=>!(S.knownGroups||[]).some(k=>k.jid===j)).map(j=>'<div class="row"><span class="mono">'+j+'</span><button class="red" onclick="allowed(\\'remove\\',\\''+j+'\\')">הסר</button></div>').join('')||'';}
function esc(s){return String(s||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function G(){return S.groups.find(x=>x.jid===cur)||{};}
function renderPrivates(){const q=(document.getElementById('psearch').value||'').trim();document.getElementById('privates').innerHTML=(S.privates||[]).filter(p=>!q||(p.name||'').includes(q)||p.jid.includes(q)).map(p=>'<div class="row"><span>'+esc(p.name||p.jid)+'<br><span class="mono">'+p.jid+'</span></span>'+(p.muted?'<button class="green" onclick="privOp(\\''+p.jid+'\\',\\'unmuteChat\\')">הדלק 🔔</button>':'<button class="red" onclick="privOp(\\''+p.jid+'\\',\\'muteChat\\')">כבה 🔕</button>')+'</div>').join('')||'<span class="small">אין עדיין</span>';}
function render(){const g=G();document.getElementById('ginfo').innerHTML='<span class="mono">'+g.jid+'</span>';
renderPrivates();
document.getElementById('toggles').innerHTML=TOGGLES.map(t=>'<div class="row"><span>'+t[1]+'</span><input type="checkbox" class="switch" '+(g.toggles&&g.toggles[t[0]]?'checked':'')+' onchange="op({op:\\'toggle\\',key:\\''+t[0]+'\\',value:this.checked},\\'נשמר — יישום עד דקה\\')"></div>').join('');
document.getElementById('linkAllow').value=(g.linkAllow||[]).join(', ');
document.getElementById('features').innerHTML=FEATURES.map(f=>{const on=(g.features||{})[f[0]]!==false;return '<div class="row"><span>'+f[1]+'</span><input type="checkbox" class="switch" '+(on?'checked':'')+' onchange="feat(\\''+f[0]+'\\',this.checked)"></div>';}).join('');
document.getElementById('wcount').textContent=Object.keys(g.warns||{}).length;
document.getElementById('warns').innerHTML=Object.entries(g.warns||{}).map(e=>'<div class="warn"><span class="mono">'+e[0]+'</span> — '+e[1]+'/3 <button onclick="op({op:\\'clearWarns\\',user:\\''+e[0]+'\\'},\\'נוקה\\')">נקה</button></div>').join('')||'<span class="small">אין</span>';
document.getElementById('muted').innerHTML=(g.muted||[]).map(u=>'<div class="warn"><span class="mono">'+u+'</span> <button onclick="op({op:\\'unmute\\',user:\\''+u+'\\'},\\'שוחרר\\')">שחרר</button></div>').join('')||'<span class="small">אין</span>';
document.getElementById('rules').value=g.rules||'';document.getElementById('welcome').value=g.welcomeText||'';}
async function op(o,msg){o.jid=o.jid||cur;const r=await api('/api/op',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});if(!r.ok){alert('שגיאה');return;}alert((msg||'נשלח')+' — מרענן עד ליישום...');let n=0;const iv=setInterval(async()=>{n++;await load();if(n>=6)clearInterval(iv);},15000);}
async function privOp(jid,op){const r=await api('/api/op',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:op,jid:jid})});alert(r.ok?'בוצע — יישום עד דקה':'שגיאה');const iv=setInterval(async()=>{await load();},15000);setTimeout(()=>clearInterval(iv),90000);}
async function feat(k,val){const g=G();const f=Object.assign({},g.features||{});f[k]=!!val;await op({op:'features',features:f},'נשמר — יישום עד דקה');}
async function featuresAll(val){const f={};FEATURES.forEach(x=>f[x[0]]=!!val);await op({op:'features',features:f},'נשמר — יישום עד דקה');}
async function saveLinkAllow(){await op({op:'linkAllow',domains:v('linkAllow').split(/[,|\\s]+/)},'נשמר');}
async function allowed(act,jid){const j=jid||v('newGroup');if(!j)return;const r=await api('/api/allowed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:act,jid:j})});alert(r.ok?'בוצע + הפעלה מחדש':'שגיאה');setTimeout(load,20000);}
async function logs(){const r=await api('/api/logs');document.getElementById('log').textContent=r.logs||'';}
async function restart(){if(confirm('להפעיל מחדש?')){await api('/api/restart',{method:'POST'});alert('מופעל מחדש');}}
document.getElementById('g').onchange=e=>{cur=e.target.value;render();};
load();logs();setInterval(load,45000);
</script></body></html>`;
