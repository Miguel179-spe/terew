const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let MOVIES = [];

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.DATA_FILE || 'data.json'), 'utf8'));
    // Mantenemos la estructura original pero asumimos que el JSON tiene un campo "genre" o "category"
    MOVIES = data.map((m, i) => ({ 
        id: i, 
        title: m.title || 'Sin título', 
        poster: m.logo || '', 
        url: m.url || '',
        genre: m.genre || m.category || 'Varios' // Campo para filtrar
    }));
    console.log(`✓ ${MOVIES.length} películas cargadas`);
} catch (e) { console.error('Error:', e.message); }

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/api/movies', (req, res) => {
    const { page = 0, limit = 50, q = '', cat = '', random } = req.query;
    let list = [...MOVIES];
    
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q.toLowerCase()));
    if (cat && cat !== 'Todas') {
        list = list.filter(m => m.genre.toLowerCase().includes(cat.toLowerCase()));
    }
    
    if (random === 'true') list.sort(() => Math.random() - 0.5);
    const start = page * limit;
    res.json({ total: list.length, hasMore: start + +limit < list.length, data: list.slice(start, start + +limit) });
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
<title>Movies+</title><style>
*{margin:0;padding:0;box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}
:root{--p:#f5c518;--bg:#0a0a0a;--s:#161616;--c:#1a1a1a;--b:#2a2a2a;--t:#e0e0e0;--t2:#888}
html,body{background:var(--bg);color:var(--t);font-family:system-ui,sans-serif;height:100%;overflow:hidden}
#app{height:100%;display:flex;flex-direction:column}
.hdr{display:flex;align-items:center;gap:10px;padding:12px;background:var(--s);border-bottom:1px solid var(--b)}
.logo{color:var(--p);font-weight:700;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s}
.logo:hover,.logo.f{background:rgba(245,197,24,0.1)}
.srch{flex:1;background:var(--bg);border:2px solid var(--b);color:var(--t);padding:10px;border-radius:8px;font-size:16px;outline:none;transition:border-color 0.2s}
.srch:focus,.srch.f{border-color:var(--p)}
.btn{background:var(--c);border:2px solid var(--b);color:var(--t);padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;transition:all 0.2s}
.btn:hover,.btn.f{background:var(--p);color:#000;border-color:var(--p)}
.stats{color:var(--t2);font-size:12px;margin-left:auto}

/* BARRA DE CATEGORIAS NUEVA */
.cat-bar{display:flex;overflow-x:auto;padding:15px 10px;gap:10px;scrollbar-width:none;background:var(--bg)}
.cat-bar::-webkit-scrollbar{display:none}
.cat-chip{background:#fff;color:#000;padding:8px 18px;border-radius:20px;font-weight:600;font-size:14px;white-space:nowrap;cursor:pointer;border:2px solid transparent;transition:0.2s}
.cat-chip.active,.cat-chip.f{background:var(--p);border-color:#fff}
.cat-chip.f{transform:scale(1.1)}

.main{flex:1;overflow-y:auto;padding:10px;-webkit-overflow-scrolling:touch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.card{position:relative;aspect-ratio:2/3;background:var(--c);border-radius:6px;overflow:hidden;border:2px solid transparent;cursor:pointer;transition:transform 0.15s, border-color 0.15s}
.card:hover{transform:scale(1.02)}
.card.f{border-color:var(--p);transform:scale(1.05);box-shadow:0 0 15px rgba(245,197,24,.3);z-index:10}
.card img{width:100%;height:100%;object-fit:cover;background:linear-gradient(45deg,#1a1a1a 25%,#222 25%,#222 50%,#1a1a1a 50%,#1a1a1a 75%,#222 75%,#222);background-size:20px 20px;opacity:0;transition:opacity 0.3s ease-in-out}
.card img.loaded{opacity:1}
.card-t{position:absolute;bottom:0;left:0;right:0;padding:20px 6px 6px;background:linear-gradient(transparent,#000);font-size:11px;font-weight:600;opacity:0;transform:translateY(5px);transition:opacity 0.2s, transform 0.2s}
.card.f .card-t{opacity:1;transform:translateY(0)}
.player{position:fixed;inset:0;background:#000;z-index:200;display:none}
.player.open{display:flex;flex-direction:column}
video{flex:1;width:100%;background:#000}
.p-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;opacity:1;transition:.2s;background:linear-gradient(#000a,transparent 15%,transparent 85%,#000a);pointer-events:none}
.p-ui>*{pointer-events:auto}.p-ui.hide{opacity:0}.p-ui.hide>*{pointer-events:none}
.p-top{padding:12px;padding-top:max(12px,env(safe-area-inset-top))}
.p-title{font-size:14px;font-weight:600}
.p-center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:40px;font-weight:700;opacity:0;transition:.15s;pointer-events:none}
.p-center.show{opacity:1}
.p-bottom{padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}
.p-prog{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.p-time{font-size:12px;min-width:45px}
.p-bar{flex:1;height:5px;background:#444;border-radius:3px;position:relative;cursor:pointer}
.p-bar-fill{position:absolute;left:0;top:0;height:100%;background:var(--p);border-radius:3px}
.p-bar-buf{position:absolute;left:0;top:0;height:100%;background:#666;border-radius:3px;z-index:-1}
.p-ctrl{display:flex;justify-content:center;gap:10px}
.p-btn{width:44px;height:44px;background:rgba(255,255,255,.1);border:none;border-radius:50%;color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.2s}
.p-btn:hover,.p-btn:active,.p-btn.f{background:var(--p);color:#000}
.p-btn.main{width:52px;height:52px;font-size:18px}
.p-load,.p-err{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;display:none}
.p-load.show,.p-err.show{display:block}
.p-spin{width:36px;height:36px;border:3px solid #333;border-top-color:var(--p);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px}
.msg{text-align:center;padding:40px;color:var(--t2)}
.msg.load::after{content:'';display:block;width:20px;height:20px;margin:12px auto 0;border:2px solid #333;border-top-color:var(--p);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
</style></head><body><div id="app">
<div class="hdr">
    <div class="logo f" id="logo">MOVIES+</div>
    <input class="srch" id="srch" placeholder="Buscar..." autocomplete="off">
    <button class="btn" id="mix">🎲</button>
    <span class="stats" id="stats"></span>
</div>
<div class="main" id="main"><div class="grid" id="grid"><div class="msg load">Cargando</div></div></div>
<div class="player" id="player">
<video id="vid" playsinline webkit-playsinline></video>
<div class="p-load" id="pLoad"><div class="p-spin"></div><div id="pLoadTxt">Cargando...</div></div>
<div class="p-err" id="pErr"><div>Error</div><div style="font-size:11px;color:#888;margin:8px 0" id="pErrTxt"></div><button class="btn" id="pRetry">Reintentar</button> <button class="btn" id="pBack">Volver</button></div>
<div class="p-center" id="pInd"></div>
<div class="p-ui" id="pUi">
<div class="p-top"><div class="p-title" id="pTitle"></div></div>
<div class="p-bottom">
<div class="p-prog"><span class="p-time" id="pCur">0:00</span><div class="p-bar" id="pBar"><div class="p-bar-buf" id="pBuf"></div><div class="p-bar-fill" id="pFill"></div></div><span class="p-time" id="pDur">0:00</span></div>
<div class="p-ctrl"><button class="p-btn" id="pRw">-10</button><button class="p-btn main" id="pPp">▶</button><button class="p-btn" id="pFw">+10</button></div>
</div></div></div></div>
<script>
(function(){
const $=id=>document.getElementById(id);
const el={
    logo:$('logo'), grid:$('grid'), main:$('main'), srch:$('srch'), mix:$('mix'), stats:$('stats'),
    player:$('player'), vid:$('vid'), pUi:$('pUi'), pTitle:$('pTitle'), pLoad:$('pLoad'), 
    pLoadTxt:$('pLoadTxt'), pErr:$('pErr'), pErrTxt:$('pErrTxt'), pInd:$('pInd'), pBar:$('pBar'), 
    pFill:$('pFill'), pBuf:$('pBuf'), pCur:$('pCur'), pDur:$('pDur'), pRw:$('pRw'), pPp:$('pPp'), 
    pFw:$('pFw'), pRetry:$('pRetry'), pBack:$('pBack')
};

const S={
    view:'home', movies:[], focus:null, lastFocus:null, playing:false, retry:0,
    imgObserver:null, gridCols:0, currentIndex:-1,
    headerElements:[], headerIndex:0,
    categories: ['Todas','Español','Ingles','Frances', catIndex: 0
};

function init() {
    S.headerElements = [el.logo, el.srch, el.mix];
    
    // Inyectar barra de categorías al inicio de main
    const cBar = document.createElement('div');
    cBar.className = 'cat-bar';
    cBar.id = 'catBar';
    S.categories.forEach((cat, i) => {
        const btn = document.createElement('div');
        btn.className = 'cat-chip' + (cat === 'Todas' ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => selectCat(cat, i);
        cBar.appendChild(btn);
    });
    el.main.prepend(cBar);

    loadMovies();
    setFocusHeader(0);
}

function selectCat(cat, index) {
    S.currentCat = cat;
    S.catIndex = index;
    document.querySelectorAll('.cat-chip').forEach((c, i) => {
        c.classList.toggle('active', i === index);
    });
    loadMovies();
}

function loadMovies(random = false) {
    el.grid.innerHTML = '<div class="msg load">Cargando</div>';
    const q = el.srch.value.trim();
    const url = '/api/movies?limit=50' + 
                (q ? '&q=' + encodeURIComponent(q) : '') + 
                (S.currentCat !== 'Todas' ? '&cat=' + encodeURIComponent(S.currentCat) : '') + 
                (random ? '&random=true' : '');

    fetch(url).then(r=>r.json()).then(d=>{
        el.stats.textContent = d.total + ' películas';
        el.grid.innerHTML = '';
        S.movies = d.data;
        d.data.forEach(m => el.grid.appendChild(mkCard(m)));
        calculateGridColumns();
        initLazyLoading();
    }).catch(()=>el.grid.innerHTML='<div class="msg">Error</div>');
}

// ===== MANEJO DE FOCUS Y NAVEGACIÓN =====
function setFocusHeader(index) {
    if(S.focus) S.focus.classList.remove('f');
    S.headerIndex = index;
    S.currentIndex = -1;
    S.catIndex = -1;
    S.focus = S.headerElements[index];
    S.focus.classList.add('f');
    if(S.focus === el.srch) el.srch.focus(); else el.srch.blur();
}

function setFocusCat(index) {
    if(S.focus) S.focus.classList.remove('f');
    const chips = document.querySelectorAll('.cat-chip');
    S.catIndex = index;
    S.headerIndex = -1;
    S.currentIndex = -1;
    S.focus = chips[index];
    S.focus.classList.add('f');
    S.focus.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
}

function setFocusGrid(index) {
    const cards = [...el.grid.querySelectorAll('.card')];
    if(!cards.length) return;
    if(S.focus) S.focus.classList.remove('f');
    S.currentIndex = index;
    S.headerIndex = -1;
    S.catIndex = -1;
    S.focus = cards[index];
    S.focus.classList.add('f');
    S.focus.scrollIntoView({block:'nearest', behavior:'smooth'});
    preloadAdjacentImages(index);
}

document.onkeydown = e => {
    const k = e.key;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backspace'].includes(k)) e.preventDefault();
    if(S.view === 'player') { playerKey(k); return; }

    if(k === 'Enter') {
        if(S.catIndex >= 0) selectCat(S.categories[S.catIndex], S.catIndex);
        else if(S.headerIndex === 0) location.reload();
        else if(S.headerIndex === 2) loadMovies(true);
        else if(S.currentIndex >= 0) play(S.movies[S.currentIndex]);
        return;
    }

    const cards = [...el.grid.querySelectorAll('.card')];

    if(k === 'ArrowDown') {
        if(S.headerIndex >= 0) setFocusCat(0);
        else if(S.catIndex >= 0) setFocusGrid(0);
        else if(S.currentIndex >= 0) setFocusGrid(Math.min(cards.length-1, S.currentIndex + S.gridCols));
    } 
    else if(k === 'ArrowUp') {
        if(S.currentIndex >= 0) {
            if(S.currentIndex < S.gridCols) setFocusCat(0);
            else setFocusGrid(S.currentIndex - S.gridCols);
        } else if(S.catIndex >= 0) setFocusHeader(1);
    }
    else if(k === 'ArrowRight') {
        if(S.headerIndex >= 0) setFocusHeader(Math.min(2, S.headerIndex + 1));
        else if(S.catIndex >= 0) setFocusCat(Math.min(S.categories.length-1, S.catIndex + 1));
        else if(S.currentIndex >= 0) setFocusGrid(Math.min(cards.length-1, S.currentIndex + 1));
    }
    else if(k === 'ArrowLeft') {
        if(S.headerIndex >= 0) setFocusHeader(Math.max(0, S.headerIndex - 1));
        else if(S.catIndex >= 0) setFocusCat(Math.max(0, S.catIndex - 1));
        else if(S.currentIndex >= 0) setFocusGrid(Math.max(0, S.currentIndex - 1));
    }
    else if(k === 'Backspace' && S.view === 'home') {
        if(S.currentIndex >= 0) setFocusCat(0);
        else if(S.catIndex >= 0) setFocusHeader(1);
    }
};

// --- Resto de funciones auxiliares (Lazy Load, Player, etc.) ---

function initLazyLoading() {
    if(S.imgObserver) S.imgObserver.disconnect();
    S.imgObserver = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if(en.isIntersecting){
                const img = en.target;
                if(img.dataset.src) {
                    img.src = img.dataset.src;
                    img.onload = () => { img.classList.add('loaded'); img.style.background='none'; };
                }
                S.imgObserver.unobserve(img);
            }
        });
    }, {rootMargin:'200px'});
    document.querySelectorAll('.card img').forEach(img => S.imgObserver.observe(img));
}

function preloadAdjacentImages(idx) {
    const imgs = document.querySelectorAll('.card img');
    for(let i=idx-2; i<=idx+2; i++) if(imgs[i] && imgs[i].dataset.src) imgs[i].src = imgs[i].dataset.src;
}

function calculateGridColumns() {
    if(!el.grid.children.length) return;
    const first = el.grid.children[0].getBoundingClientRect();
    let cols = 0;
    for(let node of el.grid.children) {
        if(Math.abs(node.getBoundingClientRect().top - first.top) < 10) cols++; else break;
    }
    S.gridCols = cols || 1;
}

function mkCard(m) {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = '<img data-src="'+esc(m.poster)+'" alt=""><div class="card-t">'+esc(m.title)+'</div>';
    d.onclick = () => play(m);
    return d;
}

// REPRODUCTOR
function play(m) {
    S.view = 'player';
    el.player.classList.add('open');
    el.pTitle.textContent = m.title;
    el.pLoad.classList.add('show');
    let u = m.url;
    if(u.startsWith('http://') || location.protocol === 'https:') u = '/video-proxy?url=' + encodeURIComponent(u);
    el.vid.src = u;
    el.vid.play().catch(()=>{});
    showUI();
}

function closeP() {
    el.vid.pause(); el.vid.src = ""; el.player.classList.remove('open'); S.view = 'home';
}

function playerKey(k) {
    showUI();
    if(k === 'ArrowLeft') seek(-10);
    else if(k === 'ArrowRight') seek(10);
    else if(k === 'Enter' || k === ' ') toggle();
    else if(k === 'Backspace' || k === 'Escape') closeP();
}

function toggle() { el.vid.paused ? el.vid.play() : el.vid.pause(); }
function seek(s) { el.vid.currentTime += s; }
function showUI() { el.pUi.classList.remove('hide'); clearTimeout(S.hT); S.hT = setTimeout(()=>el.pUi.classList.add('hide'), 3000); }
function esc(s) { return s ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]) : ''; }

el.vid.onplaying = () => { el.pLoad.classList.remove('show'); el.pPp.textContent = '⏸'; };
el.vid.onpause = () => el.pPp.textContent = '▶';
el.vid.ontimeupdate = () => {
    el.pFill.style.width = (el.vid.currentTime / el.vid.duration * 100) + '%';
};

init();
window.onresize = calculateGridColumns;
el.srch.oninput = () => { clearTimeout(S.sT); S.sT = setTimeout(loadMovies, 500); };
el.pBack.onclick = closeP;
})();
</script></body></html>`));

app.listen(PORT,'0.0.0.0',()=>console.log('🎬 Movies+ → Puerto '+PORT));
