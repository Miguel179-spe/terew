const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let MOVIES = [];
let CATEGORIES = {};

// Cargar y procesar datos
try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.DATA_FILE || 'data.json'), 'utf8'));
    MOVIES = data.map((m, i) => ({ 
        id: i, 
        title: m.title || 'Sin título', 
        poster: m.logo || '', 
        url: m.url || '',
        category: m.category || 'General' 
    }));
    
    // Agrupar por categorías inicialmente
    groupMovies(MOVIES);
    console.log(`✓ ${MOVIES.length} películas en ${Object.keys(CATEGORIES).length} categorías`);
} catch (e) { console.error('Error:', e.message); }

function groupMovies(list) {
    CATEGORIES = list.reduce((acc, m) => {
        const cat = m.category;
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(m);
        return acc;
    }, {});
}

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// API actualizada para devolver categorías
app.get('/api/movies', (req, res) => {
    const { q = '', random } = req.query;
    let list = q ? MOVIES.filter(m => m.title.toLowerCase().includes(q.toLowerCase())) : [...MOVIES];
    if (random === 'true') list.sort(() => Math.random() - 0.5);
    
    // Re-agrupar para la respuesta
    const grouped = list.reduce((acc, m) => {
        if (!acc[m.category]) acc[m.category] = [];
        acc[m.category].push(m);
        return acc;
    }, {});

    res.json({ total: list.length, categories: grouped });
});

app.get('/video-proxy', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).end();
    let parsed;
    try { parsed = new URL(decodeURIComponent(url)); } catch { return res.status(400).end(); }
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', 'Accept-Encoding': 'identity', 'Referer': parsed.origin + '/' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    const proxyReq = client.request({ hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname + parsed.search, headers, timeout: 30000 }, proxyRes => {
        if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
            proxyRes.destroy();
            return res.redirect(307, '/video-proxy?url=' + encodeURIComponent(proxyRes.headers.location));
        }
        const h = { 'Content-Type': proxyRes.headers['content-type'] || 'video/mp4', 'Accept-Ranges': 'bytes' };
        if (proxyRes.headers['content-length']) h['Content-Length'] = proxyRes.headers['content-length'];
        if (proxyRes.headers['content-range']) h['Content-Range'] = proxyRes.headers['content-range'];
        res.writeHead(proxyRes.statusCode, h);
        proxyRes.pipe(res);
        proxyRes.on('error', () => res.end());
    });
    proxyReq.on('error', () => !res.headersSent && res.status(502).end());
    proxyReq.on('timeout', () => { proxyReq.destroy(); !res.headersSent && res.status(504).end(); });
    req.on('close', () => proxyReq.destroy());
    proxyReq.end();
});

app.get('/', (req, res) => res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Movies+ Premium</title><style>
*{margin:0;padding:0;box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}
:root{--p:#f5c518;--bg:#0a0a0a;--s:#161616;--c:#1a1a1a;--b:#2a2a2a;--t:#e0e0e0;--t2:#888}
html,body{background:var(--bg);color:var(--t);font-family:system-ui,sans-serif;height:100%;overflow:hidden}
#app{height:100%;display:flex;flex-direction:column}
.hdr{display:flex;align-items:center;gap:15px;padding:15px 25px;background:var(--s);z-index:100}
.logo{color:var(--p);font-weight:800;font-size:22px;cursor:pointer}
.logo.f{text-shadow: 0 0 10px var(--p)}
.srch{flex:1;background:var(--bg);border:2px solid var(--b);color:var(--t);padding:10px 15px;border-radius:8px;font-size:16px;outline:none}
.srch.f{border-color:var(--p)}
.btn{background:var(--c);border:none;color:var(--t);padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer}
.btn.f{background:var(--p);color:#000}

.main{flex:1;overflow-y:auto;padding:20px 0;scroll-behavior: smooth}
.row{margin-bottom:30px}
.row-title{padding:0 25px 10px;font-size:18px;font-weight:700;color:var(--t)}
.row-inner{display:flex;overflow-x:auto;padding:0 25px;gap:12px;scroll-behavior: smooth}
.row-inner::-webkit-scrollbar {display: none}

.card{flex: 0 0 160px; position:relative;aspect-ratio:2/3;background:var(--c);border-radius:8px;overflow:hidden;border:3px solid transparent;transition:transform 0.2s}
.card.f{border-color:var(--p);transform:scale(1.05);z-index:10}
.card img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s}
.card img.loaded{opacity:1}
.card-t{position:absolute;bottom:0;left:0;right:0;padding:20px 8px 8px;background:linear-gradient(transparent,#000);font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.player{position:fixed;inset:0;background:#000;z-index:200;display:none}
.player.open{display:flex;flex-direction:column}
video{flex:1;width:100%}
.p-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(#000a,transparent 20%,transparent 80%,#000a);padding:20px}
.p-ui.hide{opacity:0;pointer-events:none}
.p-prog{display:flex;align-items:center;gap:15px}
.p-bar{flex:1;height:6px;background:rgba(255,255,255,0.2);border-radius:3px;position:relative}
.p-bar-fill{position:absolute;height:100%;background:var(--p);border-radius:3px}
.p-ctrl{display:flex;justify-content:center;gap:20px;margin-top:15px}
.p-btn{width:50px;height:50px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:18px}
.p-btn.f{background:var(--p);color:#000}
.p-load{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center}
.p-spin{width:40px;height:40px;border:4px solid #333;border-top-color:var(--p);border-radius:50%;animation:spin 1s linear infinite;margin-bottom:10px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div id="app">
    <div class="hdr" id="hdr">
        <div class="logo" id="logo">MOVIES+</div>
        <input class="srch" id="srch" placeholder="Buscar película..." autocomplete="off">
        <button class="btn" id="mix">Aleatorio 🎲</button>
    </div>
    
    <div class="main" id="main">
        <div id="content"></div>
    </div>

    <div class="player" id="player">
        <video id="vid" playsinline></video>
        <div class="p-load" id="pLoad"><div class="p-spin"></div><div id="pLoadTxt">Cargando...</div></div>
        <div class="p-ui" id="pUi">
            <h2 id="pTitle"></h2>
            <div class="p-bottom">
                <div class="p-prog">
                    <span id="pCur">0:00</span>
                    <div class="p-bar"><div class="p-bar-fill" id="pFill"></div></div>
                    <span id="pDur">0:00</span>
                </div>
                <div class="p-ctrl">
                    <button class="p-btn" id="pRw">-10s</button>
                    <button class="p-btn" id="pPp">▶</button>
                    <button class="p-btn" id="pFw">+10s</button>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
const $ = id => document.getElementById(id);
const S = {
    view: 'home',
    sections: [], // {title, movies, el}
    row: -1, // -1 es header
    col: 0,
    headerIdx: 0, // 0:logo, 1:search, 2:mix
    playing: false
};

const el = {
    hdr: $('hdr'), logo: $('logo'), srch: $('srch'), mix: $('mix'),
    main: $('main'), content: $('content'),
    player: $('player'), vid: $('vid'), pUi: $('pUi')
};

function init() {
    loadData();
    setupEvents();
}

async function loadData(query = '', random = false) {
    el.content.innerHTML = '<div style="padding:40px;text-align:center">Cargando...</div>';
    try {
        const res = await fetch(\`/api/movies?q=\${encodeURIComponent(query)}&random=\${random}\`);
        const data = await res.json();
        render(data.categories);
    } catch (e) {
        el.content.innerHTML = '<div style="padding:40px;text-align:center">Error al cargar datos</div>';
    }
}

function render(categories) {
    el.content.innerHTML = '';
    S.sections = [];
    
    Object.entries(categories).forEach(([name, movies], rIdx) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = \`<div class="row-title">\${name}</div>\`;
        
        const inner = document.createElement('div');
        inner.className = 'row-inner';
        
        movies.forEach((m, cIdx) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = \`<img data-src="\${m.poster}" alt="\${m.title}"><div class="card-t">\${m.title}</div>\`;
            card.onclick = () => play(m);
            inner.appendChild(card);
            
            // Lazy load observer
            const img = card.querySelector('img');
            const obs = new IntersectionObserver(entries => {
                entries.forEach(en => {
                    if(en.isIntersecting) {
                        img.src = img.dataset.src;
                        img.onload = () => img.classList.add('loaded');
                        obs.disconnect();
                    }
                });
            });
            obs.observe(card);
        });
        
        row.appendChild(inner);
        el.content.appendChild(row);
        S.sections.push({ title: name, movies: movies, elements: [...inner.children], container: inner });
    });
    
    S.row = -1; S.headerIdx = 1;
    updateFocus();
}

function updateFocus() {
    document.querySelectorAll('.f').forEach(e => e.classList.remove('f'));
    
    if (S.row === -1) {
        const hItems = [el.logo, el.srch, el.mix];
        hItems[S.headerIdx].classList.add('f');
        if(S.headerIdx === 1) el.srch.focus(); else el.srch.blur();
    } else {
        el.srch.blur();
        const section = S.sections[S.row];
        if (section) {
            const card = section.elements[S.col];
            if (card) {
                card.classList.add('f');
                // Scroll suave horizontal
                card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
        }
    }
}

function nav(key) {
    if (S.view === 'player') return handlePlayerKey(key);

    if (key === 'ArrowDown') {
        if (S.row < S.sections.length - 1) {
            S.row++;
            // Intentar mantener la columna o ir a la última disponible
            S.col = Math.min(S.col, S.sections[S.row].elements.length - 1);
        }
    } else if (key === 'ArrowUp') {
        if (S.row > 0) S.row--;
        else S.row = -1;
    } else if (key === 'ArrowRight') {
        if (S.row === -1) S.headerIdx = Math.min(2, S.headerIdx + 1);
        else S.col = Math.min(S.sections[S.row].elements.length - 1, S.col + 1);
    } else if (key === 'ArrowLeft') {
        if (S.row === -1) S.headerIdx = Math.max(0, S.headerIdx - 1);
        else if (S.col > 0) S.col--;
    } else if (key === 'Enter') {
        if (S.row === -1) {
            if (S.headerIdx === 0) location.reload();
            if (S.headerIdx === 2) loadData('', true);
        } else {
            play(S.sections[S.row].movies[S.col]);
        }
    }
    updateFocus();
}

function play(m) {
    S.view = 'player';
    el.player.classList.add('open');
    $('pTitle').textContent = m.title;
    let url = m.url;
    if(url.startsWith('http://') || location.protocol === 'https:') {
        url = '/video-proxy?url=' + encodeURIComponent(url);
    }
    el.vid.src = url;
    el.vid.play();
    showUI();
}

function handlePlayerKey(key) {
    showUI();
    if (key === 'Escape' || key === 'Backspace') {
        el.vid.pause();
        el.player.classList.remove('open');
        S.view = 'home';
    } else if (key === ' ') {
        el.vid.paused ? el.vid.play() : el.vid.pause();
    } else if (key === 'ArrowRight') el.vid.currentTime += 10;
    else if (key === 'ArrowLeft') el.vid.currentTime -= 10;
}

let uiT;
function showUI() {
    el.pUi.classList.remove('hide');
    clearTimeout(uiT);
    uiT = setTimeout(() => { if(!el.vid.paused) el.pUi.classList.add('hide') }, 3000);
}

function setupEvents() {
    window.onkeydown = e => {
        if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backspace'].includes(e.key)) {
            if(S.view === 'home' && S.row === -1 && S.headerIdx === 1) {
                // Si el buscador tiene foco, permitir navegación normal
                if(e.key === 'ArrowDown') { e.preventDefault(); nav(e.key); }
            } else {
                e.preventDefault();
                nav(e.key);
            }
        }
    };
    
    el.srch.oninput = (e) => loadData(e.target.value);
    
    el.vid.ontimeupdate = () => {
        const p = (el.vid.currentTime / el.vid.duration) * 100;
        $('pFill').style.width = p + '%';
        $('pCur').textContent = fmt(el.vid.currentTime);
        $('pDur').textContent = fmt(el.vid.duration);
    };
}

function fmt(s) {
    if(!s) return '0:00';
    const m = Math.floor(s/60), ss = Math.floor(s%60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
}

init();
</script></body></html>`));

app.listen(PORT, '0.0.0.0', () => console.log('🎬 Movies+ → http://localhost:'+PORT));
