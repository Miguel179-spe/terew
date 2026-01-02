const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let MOVIES = [];

// CARGAR DATOS
try {
    const dataPath = path.join(__dirname, process.env.DATA_FILE || 'data.json');
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        MOVIES = data.map((m, i) => ({ 
            id: i, 
            title: m.title || 'Sin título', 
            poster: m.logo || m.poster || '', 
            url: m.url || '',
            genre: m.genre || m.category || 'Varios'
        }));
        console.log(`✓ ${MOVIES.length} películas cargadas`);
    } else {
        console.log("! Archivo data.json no encontrado");
    }
} catch (e) { console.error('Error cargando JSON:', e.message); }

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// API
app.get('/api/movies', (req, res) => {
    const { page = 0, limit = 50, q = '', cat = '', random } = req.query;
    let list = [...MOVIES];
    
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q.toLowerCase()));
    if (cat && cat !== 'Todas') {
        list = list.filter(m => m.genre.toLowerCase().includes(cat.toLowerCase()));
    }
    
    if (random === 'true') list.sort(() => Math.random() - 0.5);
    const start = parseInt(page) * parseInt(limit);
    res.json({ 
        total: list.length, 
        hasMore: start + parseInt(limit) < list.length, 
        data: list.slice(start, start + parseInt(limit)) 
    });
});

// PROXY DE VIDEO
app.get('/video-proxy', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).end();
    let parsed;
    try { parsed = new URL(decodeURIComponent(url)); } catch { return res.status(400).end(); }
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', 'Referer': parsed.origin + '/' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    
    const proxyReq = client.request({ 
        hostname: parsed.hostname, 
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), 
        path: parsed.pathname + parsed.search, 
        headers, 
        timeout: 10000 
    }, proxyRes => {
        if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
            return res.redirect('/video-proxy?url=' + encodeURIComponent(proxyRes.headers.location));
        }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', () => !res.headersSent && res.status(502).end());
    proxyReq.end();
});

// FRONTEND
app.get('/', (req, res) => res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Movies+</title><style>
*{margin:0;padding:0;box-sizing:border-box;user-select:none;-webkit-tap-highlight-color:transparent}
:root{--p:#f5c518;--bg:#0a0a0a;--s:#161616;--c:#1a1a1a;--b:#2a2a2a;--t:#e0e0e0;--t2:#888}
html,body{background:var(--bg);color:var(--t);font-family:system-ui,sans-serif;height:100%;overflow:hidden}
#app{height:100%;display:flex;flex-direction:column}
.hdr{display:flex;align-items:center;gap:10px;padding:12px;background:var(--s);border-bottom:1px solid var(--b)}
.logo{color:var(--p);font-weight:700;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px}
.srch{flex:1;background:var(--bg);border:2px solid var(--b);color:var(--t);padding:10px;border-radius:8px;font-size:16px;outline:none}
.btn{background:var(--c);border:2px solid var(--b);color:var(--t);padding:10px 16px;border-radius:8px;cursor:pointer}
.f{border-color:var(--p) !important; background:rgba(245,197,24,0.2) !important; outline:none}
.cat-bar{display:flex;overflow-x:auto;padding:15px 10px;gap:10px;background:var(--bg)}
.cat-chip{background:var(--c);color:var(--t);padding:8px 18px;border-radius:20px;font-size:14px;white-space:nowrap;cursor:pointer;border:2px solid transparent}
.cat-chip.active{background:var(--p);color:#000}
.main{flex:1;overflow-y:auto;padding:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.card{position:relative;aspect-ratio:2/3;background:var(--c);border-radius:6px;overflow:hidden;border:2px solid transparent;cursor:pointer}
.card img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s}
.card-t{position:absolute;bottom:0;left:0;right:0;padding:20px 6px 6px;background:linear-gradient(transparent,#000);font-size:11px;font-weight:600}
.player{position:fixed;inset:0;background:#000;z-index:200;display:none;flex-direction:column}
.player.open{display:flex}
video{flex:1;width:100%}
.p-ui{position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;justify-content:space-between;padding:20px}
.p-bar{height:6px;background:#444;position:relative;margin:10px 0;border-radius:3px}
.p-fill{height:100%;background:var(--p);width:0%;border-radius:3px}
.p-hide{display:none}
</style></head><body>
<div id="app">
    <div class="hdr">
        <div class="logo" id="logo">MOVIES+</div>
        <input class="srch" id="srch" placeholder="Buscar..." autocomplete="off">
        <button class="btn" id="mix">🎲</button>
    </div>
    <div class="cat-bar" id="catBar"></div>
    <div class="main" id="main"><div class="grid" id="grid"></div></div>
    
    <div class="player" id="player">
        <video id="vid"></video>
        <div class="p-ui" id="pUi">
            <h2 id="pTitle"></h2>
            <div>
                <div class="p-bar"><div class="p-fill" id="pFill"></div></div>
                <div id="pTime">00:00 / 00:00</div>
            </div>
        </div>
    </div>
</div>

<script>
(function(){
    const $ = id => document.getElementById(id);
    const S = {
        view: 'home', 
        movies: [], 
        focus: null,
        headerIndex: 0,
        catIndex: -1,
        currentIndex: -1,
        currentCat: 'Todas',
        categories: ['Todas','Acción','Comedia','Terror','Drama','Español','Ingles'],
        gridCols: 4
    };

    const el = {
        logo: $('logo'), srch: $('srch'), mix: $('mix'), 
        catBar: $('catBar'), grid: $('grid'), player: $('player'),
        vid: $('vid'), pFill: $('pFill'), pTitle: $('pTitle'), pUi: $('pUi')
    };

    function init() {
        S.categories.forEach((cat, i) => {
            const btn = document.createElement('div');
            btn.className = 'cat-chip' + (cat === S.currentCat ? ' active' : '');
            btn.textContent = cat;
            btn.onclick = () => selectCat(cat, i);
            el.catBar.appendChild(btn);
        });
        loadMovies();
        setFocusHeader(1); // Empezar en el buscador
    }

    function loadMovies(random = false) {
        el.grid.innerHTML = '<div style="padding:20px">Cargando...</div>';
        const q = el.srch.value.trim();
        const url = \`/api/movies?q=\${encodeURIComponent(q)}&cat=\${encodeURIComponent(S.currentCat)}&random=\${random}\`;

        fetch(url).then(r => r.json()).then(d => {
            S.movies = d.data;
            el.grid.innerHTML = S.movies.map((m, i) => \`
                <div class="card" onclick="playMovie(\${i})">
                    <img data-src="\${m.poster}" class="lazy">
                    <div class="card-t">\${m.title}</div>
                </div>\`).join('');
            calculateGridCols();
            initLazy();
        });
    }

    function selectCat(cat, index) {
        S.currentCat = cat;
        document.querySelectorAll('.cat-chip').forEach((c, i) => c.classList.toggle('active', i === index));
        loadMovies();
    }

    // NAVEGACIÓN
    function setFocusHeader(idx) {
        if(S.focus) S.focus.classList.remove('f');
        S.headerIndex = idx; S.catIndex = -1; S.currentIndex = -1;
        const items = [el.logo, el.srch, el.mix];
        S.focus = items[idx];
        S.focus.classList.add('f');
        if(idx === 1) el.srch.focus(); else el.srch.blur();
    }

    function setFocusCat(idx) {
        if(S.focus) S.focus.classList.remove('f');
        S.headerIndex = -1; S.catIndex = idx; S.currentIndex = -1;
        const chips = document.querySelectorAll('.cat-chip');
        S.focus = chips[idx];
        S.focus.classList.add('f');
        S.focus.scrollIntoView({inline:'center', behavior:'smooth'});
    }

    function setFocusGrid(idx) {
        const cards = document.querySelectorAll('.card');
        if(!cards[idx]) return;
        if(S.focus) S.focus.classList.remove('f');
        S.headerIndex = -1; S.catIndex = -1; S.currentIndex = idx;
        S.focus = cards[idx];
        S.focus.classList.add('f');
        S.focus.scrollIntoView({block:'center', behavior:'smooth'});
    }

    document.onkeydown = e => {
        if(S.view === 'player') {
            if(e.key === 'Backspace' || e.key === 'Escape') closePlayer();
            return;
        }

        if(e.key === 'ArrowRight') {
            if(S.headerIndex >= 0) setFocusHeader(Math.min(2, S.headerIndex + 1));
            else if(S.catIndex >= 0) setFocusCat(Math.min(S.categories.length-1, S.catIndex + 1));
            else if(S.currentIndex >= 0) setFocusGrid(Math.min(S.movies.length-1, S.currentIndex + 1));
        }
        if(e.key === 'ArrowLeft') {
            if(S.headerIndex >= 0) setFocusHeader(Math.max(0, S.headerIndex - 1));
            else if(S.catIndex >= 0) setFocusCat(Math.max(0, S.catIndex - 1));
            else if(S.currentIndex >= 0) setFocusGrid(Math.max(0, S.currentIndex - 1));
        }
        if(e.key === 'ArrowDown') {
            if(S.headerIndex >= 0) setFocusCat(0);
            else if(S.catIndex >= 0) setFocusGrid(0);
            else if(S.currentIndex >= 0) setFocusGrid(Math.min(S.movies.length-1, S.currentIndex + S.gridCols));
        }
        if(e.key === 'ArrowUp') {
            if(S.currentIndex >= S.gridCols) setFocusGrid(S.currentIndex - S.gridCols);
            else if(S.currentIndex >= 0) setFocusCat(0);
            else if(S.catIndex >= 0) setFocusHeader(1);
        }
        if(e.key === 'Enter') {
            if(S.headerIndex === 2) loadMovies(true);
            else if(S.catIndex >= 0) selectCat(S.categories[S.catIndex], S.catIndex);
            else if(S.currentIndex >= 0) playMovie(S.currentIndex);
        }
    };

    function playMovie(idx) {
        const m = S.movies[idx];
        S.view = 'player';
        el.player.classList.add('open');
        el.pTitle.textContent = m.title;
        let url = m.url;
        if(!url.includes(window.location.host)) url = '/video-proxy?url=' + encodeURIComponent(url);
        el.vid.src = url;
        el.vid.play();
    }

    function closePlayer() {
        el.vid.pause();
        el.vid.src = "";
        el.player.classList.remove('open');
        S.view = 'home';
    }

    function initLazy() {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if(en.isIntersecting) {
                    const img = en.target;
                    img.src = img.dataset.src;
                    img.onload = () => img.style.opacity = 1;
                    observer.unobserve(img);
                }
            });
        });
        document.querySelectorAll('img.lazy').forEach(i => observer.observe(i));
    }

    function calculateGridCols() {
        const grid = el.grid;
        if(grid.children.length === 0) return;
        S.gridCols = Math.floor(grid.offsetWidth / 140);
    }

    el.srch.oninput = () => {
        clearTimeout(S.searchTimer);
        S.searchTimer = setTimeout(loadMovies, 500);
    };

    el.vid.ontimeupdate = () => {
        const p = (el.vid.currentTime / el.vid.duration) * 100;
        el.pFill.style.width = p + '%';
    };

    window.onresize = calculateGridCols;
    init();
})();
</script></body></html>`));

app.listen(PORT, '0.0.0.0', () => console.log('🎬 Movies+ en puerto ' + PORT));
