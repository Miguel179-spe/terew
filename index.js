const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de archivos por categoría
const CATEGORY_FILES = {
    'Español': 'espanol.json',
    'Ingles': 'ingles.json',
    'Frances': 'frances.json'
};

let MOVIES = [];

// CARGA DE DATOS MULTI-ARCHIVO
function loadAllData() {
    MOVIES = [];
    Object.keys(CATEGORY_FILES).forEach(catName => {
        const fileName = CATEGORY_FILES[catName];
        const filePath = path.join(__dirname, fileName);
        
        try {
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const mapped = data.map((m, i) => ({
                    id: `${catName}-${i}`,
                    title: m.title || 'Sin título',
                    poster: m.logo || m.poster || '',
                    url: m.url || '',
                    category: catName
                }));
                MOVIES = [...MOVIES, ...mapped];
                console.log(`✓ ${catName}: ${mapped.length} películas`);
            }
        } catch (e) { console.error(`Error en ${fileName}:`, e.message); }
    });
    console.log(`Total: ${MOVIES.length} películas cargadas.`);
}

loadAllData();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.get('/api/movies', (req, res) => {
    const { q = '', cat = 'Todas', random } = req.query;
    let list = [...MOVIES];
    
    // Filtro por categoría
    if (cat !== 'Todas') {
        list = list.filter(m => m.category === cat);
    }
    
    // Filtro por búsqueda
    if (q) {
        list = list.filter(m => m.title.toLowerCase().includes(q.toLowerCase()));
    }
    
    if (random === 'true') list.sort(() => Math.random() - 0.5);
    
    res.json({ total: list.length, data: list.slice(0, 300) });
});

app.get('/video-proxy', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).end();
    let parsed;
    try { parsed = new URL(decodeURIComponent(url)); } catch { return res.status(400).end(); }
    const client = parsed.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*', 'Referer': parsed.origin + '/' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    const proxyReq = client.request({ hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname + parsed.search, headers, timeout: 30000 }, proxyRes => {
        if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
            proxyRes.destroy();
            return res.redirect(307, '/video-proxy?url=' + encodeURIComponent(proxyRes.headers.location));
        }
        res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': proxyRes.headers['content-length'], 'Content-Range': proxyRes.headers['content-range'] });
        proxyRes.pipe(res);
    });
    proxyReq.on('error', () => !res.headersSent && res.status(502).end());
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
.logo{color:var(--p);font-weight:700;font-size:18px}
.srch{flex:1;background:var(--bg);border:2px solid var(--b);color:var(--t);padding:10px;border-radius:8px;font-size:16px;outline:none}
.f{border-color:var(--p) !important; box-shadow:0 0 10px rgba(245,197,24,.3)}
.btn{background:var(--c);border:2px solid var(--b);color:var(--t);padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer}
.btn.f{background:var(--p);color:#000}

/* Categorías */
.cat-bar{display:flex;gap:10px;padding:10px 12px;overflow-x:auto;scrollbar-width:none;background:var(--bg)}
.cat-bar::-webkit-scrollbar{display:none}
.cat-item{padding:8px 20px;background:var(--c);border:2px solid var(--b);border-radius:20px;white-space:nowrap;cursor:pointer;font-size:14px;font-weight:600}
.cat-item.active{background:var(--p);color:#000;border-color:var(--p)}
.cat-item.f{border-color:var(--t);transform:scale(1.05)}

.main{flex:1;overflow-y:auto;padding:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.card{position:relative;aspect-ratio:2/3;background:var(--c);border-radius:6px;overflow:hidden;border:2px solid transparent;cursor:pointer}
.card.f{border-color:var(--p);transform:scale(1.02);z-index:2}
.card img{width:100%;height:100%;object-fit:cover;transition:opacity .3s}
.card-t{position:absolute;bottom:0;left:0;right:0;padding:20px 6px 6px;background:linear-gradient(transparent,#000);font-size:11px;font-weight:600;opacity:0}
.card.f .card-t{opacity:1}

.player{position:fixed;inset:0;background:#000;z-index:200;display:none}
.player.open{display:flex;flex-direction:column}
video{flex:1;width:100%}
.p-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(#000a,transparent 20%,transparent 80%,#000a);padding:20px;pointer-events:none}
.p-ui>*{pointer-events:auto}
.p-bar{height:5px;background:#444;border-radius:3px;position:relative;margin:10px 0;cursor:pointer}
.p-fill{height:100%;background:var(--p);width:0%;border-radius:3px}
.hide{opacity:0}
</style></head><body><div id="app">
<div class="hdr">
    <div class="logo">MOVIES+</div>
    <input class="srch" id="srch" placeholder="Buscar...">
    <button class="btn" id="mix">🎲</button>
</div>
<div class="cat-bar" id="catBar"></div>
<div class="main" id="main"><div class="grid" id="grid"></div></div>

<div class="player" id="player">
    <video id="vid" playsinline></video>
    <div class="p-ui" id="pUi">
        <h2 id="pTitle"></h2>
        <div class="p-bottom">
            <div class="p-bar" id="pBar"><div class="p-fill" id="pFill"></div></div>
            <div style="display:flex;justify-content:center;gap:20px">
                <button class="btn" id="pBack">VOLVER</button>
                <button class="btn" id="pPp">PAUSA</button>
            </div>
        </div>
    </div>
</div>
</div>
<script>
(function(){
const $=id=>document.getElementById(id);
const S={
    view:'home', movies:[], focus:null, 
    cat:'Todas', categories:['Todas','Español','Ingles','Frances'],
    gridCols:0, currentIndex:0, catIndex:-1, headerIdx:0
};

const el={
    grid:$('grid'), catBar:$('catBar'), srch:$('srch'), mix:$('mix'),
    player:$('player'), vid:$('vid'), pTitle:$('pTitle'), pFill:$('pFill'), pPp:$('pPp')
};

function init() {
    // Render categorías
    S.categories.forEach((c, i) => {
        const div = document.createElement('div');
        div.className = 'cat-item' + (c === S.cat ? ' active' : '');
        div.textContent = c;
        div.onclick = () => selectCat(c);
        el.catBar.appendChild(div);
    });
    
    loadMovies();
    setFocusHeader(0);
}

function selectCat(name) {
    S.cat = name;
    Array.from(el.catBar.children).forEach(child => {
        child.classList.toggle('active', child.textContent === name);
    });
    loadMovies();
}

function loadMovies() {
    el.grid.innerHTML = '<div style="padding:20px">Cargando...</div>';
    const q = el.srch.value.trim();
    fetch(\`/api/movies?cat=\${S.cat}&q=\${q}\`).then(r=>r.json()).then(d=>{
        S.movies = d.data;
        el.grid.innerHTML = S.movies.map((m,i)=> \`
            <div class="card" onclick="playMovie(\${i})">
                <img src="\${m.poster}" loading="lazy">
                <div class="card-t">\${m.title}</div>
            </div>
        \`).join('');
        calculateCols();
        if(S.currentIndex >= S.movies.length) S.currentIndex = 0;
    });
}

function calculateCols() {
    if(el.grid.children.length) {
        S.gridCols = Math.floor(el.grid.offsetWidth / 138);
    }
}

// NAVEGACIÓN
function setFocusHeader(idx) {
    if(S.focus) S.focus.classList.remove('f');
    S.headerIdx = idx; S.catIndex = -1; S.currentIndex = -1;
    S.focus = idx === 0 ? el.srch : el.mix;
    S.focus.classList.add('f');
    if(idx === 0) el.srch.focus(); else el.srch.blur();
}

function setFocusCat(idx) {
    if(S.focus) S.focus.classList.remove('f');
    S.headerIdx = -1; S.currentIndex = -1; S.catIndex = idx;
    S.focus = el.catBar.children[idx];
    S.focus.classList.add('f');
    S.focus.scrollIntoView({inline:'center', behavior:'smooth'});
    el.srch.blur();
}

function setFocusGrid(idx) {
    const cards = el.grid.children;
    if(!cards[idx]) return;
    if(S.focus) S.focus.classList.remove('f');
    S.headerIdx = -1; S.catIndex = -1; S.currentIndex = idx;
    S.focus = cards[idx];
    S.focus.classList.add('f');
    S.focus.scrollIntoView({block:'center', behavior:'smooth'});
    el.srch.blur();
}

document.onkeydown = e => {
    if(S.view === 'player') {
        if(e.key === 'Backspace' || e.key === 'Escape') closeP();
        if(e.key === 'Enter' || e.key === ' ') toggleVid();
        return;
    }
    
    const k = e.key;
    if(k === 'ArrowRight') {
        if(S.headerIdx === 0) setFocusHeader(1);
        else if(S.catIndex >= 0) setFocusCat(Math.min(S.categories.length-1, S.catIndex+1));
        else if(S.currentIndex >= 0) setFocusGrid(Math.min(S.movies.length-1, S.currentIndex+1));
    }
    if(k === 'ArrowLeft') {
        if(S.headerIdx === 1) setFocusHeader(0);
        else if(S.catIndex > 0) setFocusCat(S.catIndex-1);
        else if(S.currentIndex > 0) setFocusGrid(S.currentIndex-1);
    }
    if(k === 'ArrowDown') {
        if(S.headerIdx >= 0) setFocusCat(0);
        else if(S.catIndex >= 0) setFocusGrid(0);
        else if(S.currentIndex >= 0) setFocusGrid(Math.min(S.movies.length-1, S.currentIndex + S.gridCols));
    }
    if(k === 'ArrowUp') {
        if(S.currentIndex >= S.gridCols) setFocusGrid(S.currentIndex - S.gridCols);
        else if(S.currentIndex >= 0) setFocusCat(0);
        else if(S.catIndex >= 0) setFocusHeader(0);
    }
    if(k === 'Enter') {
        if(S.catIndex >= 0) selectCat(S.categories[S.catIndex]);
        if(S.currentIndex >= 0) playMovie(S.currentIndex);
        if(S.headerIdx === 1) loadMovies(); // Mix
    }
};

function playMovie(idx) {
    const m = S.movies[idx];
    S.view = 'player';
    el.player.classList.add('open');
    el.pTitle.textContent = m.title;
    let url = m.url;
    if(url.startsWith('http://') || location.protocol === 'https:') {
        url = '/video-proxy?url=' + encodeURIComponent(url);
    }
    el.vid.src = url;
    el.vid.play();
}

function closeP() {
    el.vid.pause(); el.vid.src = '';
    el.player.classList.remove('open');
    S.view = 'home';
}

function toggleVid() {
    if(el.vid.paused) el.vid.play(); else el.vid.pause();
    el.pPp.textContent = el.vid.paused ? 'PLAY' : 'PAUSA';
}

el.vid.ontimeupdate = () => {
    el.pFill.style.width = (el.vid.currentTime / el.vid.duration * 100) + '%';
};

el.srch.oninput = () => {
    clearTimeout(window.st);
    window.st = setTimeout(loadMovies, 500);
};

window.onresize = calculateCols;
$('pBack').onclick = closeP;
$('pPp').onclick = toggleVid;

init();
})();
</script></body></html>`));

app.listen(PORT,'0.0.0.0',()=>console.log('🎬 Movies+ → Puerto '+PORT));
