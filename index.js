const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let MOVIES = [];

// Lista de categorías de tu imagen
const CATEGORY_LIST = [
    "Acción", "Animación", "Aventura", "Bélica", "Ciencia ficción", "Comedia", 
    "Crimen", "Documental", "Drama", "Familia", "Fantasía", "Historia", 
    "Misterio", "Música", "Película de TV", "Romance", "Suspense", "Terror", "Western"
];

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.DATA_FILE || 'data.json'), 'utf8'));
    MOVIES = data.map((m, i) => ({ 
        id: i, 
        title: m.title || 'Sin título', 
        poster: m.logo || '', 
        url: m.url || '',
        category: m.category || 'Otros' 
    }));
    console.log(`✓ ${MOVIES.length} películas cargadas`);
} catch (e) { console.error('Error:', e.message); }

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    next();
});

app.get('/api/movies', (req, res) => {
    const { q = '', cat = '' } = req.query;
    let list = [...MOVIES];
    
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q.toLowerCase()));
    if (cat && cat !== 'Todas') list = list.filter(m => m.category.includes(cat));

    // Agrupar por categorías para el diseño de filas
    const grouped = list.reduce((acc, m) => {
        const c = m.category || 'Otros';
        if (!acc[c]) acc[c] = [];
        acc[c].push(m);
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
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Referer': parsed.origin + '/' };
    if (req.headers.range) headers['Range'] = req.headers.range;
    
    const proxyReq = client.request({ 
        hostname: parsed.hostname, 
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), 
        path: parsed.pathname + parsed.search, 
        headers, 
        timeout: 10000 
    }, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });
    proxyReq.on('error', () => res.status(502).end());
    proxyReq.end();
});

app.get('/', (req, res) => res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Movies+ Categorías</title><style>
:root{--p:#f5c518;--bg:#0a0a0a;--s:#161616;--c:#1a1a1a;--b:#2a2a2a;--t:#e0e0e0;--t2:#888}
*{margin:0;padding:0;box-sizing:border-box;user-select:none}
body{background:var(--bg);color:var(--t);font-family:system-ui,sans-serif;overflow:hidden;height:100vh}
#app{display:flex;flex-direction:column;height:100%}

/* Header y Buscador */
.hdr{padding:15px 25px;background:var(--s);display:flex;flex-direction:column;gap:15px}
.hdr-top{display:flex;align-items:center;gap:20px}
.logo{color:var(--p);font-weight:900;font-size:24px}
.srch{flex:1;background:var(--bg);border:2px solid var(--b);color:#fff;padding:12px;border-radius:10px;outline:none;font-size:16px}
.srch:focus{border-color:var(--p)}

/* Contenedor de Categorías (Imagen) */
.cats-bar{display:flex;flex-wrap:wrap;gap:8px;padding:5px 0}
.cat-chip{
    background:#fff;color:#000;border:1px solid #ccc;
    padding:6px 18px;border-radius:25px;font-size:14px;
    font-weight:500;cursor:pointer;transition:0.2s;
}
.cat-chip:hover, .cat-chip.active{background:var(--p);border-color:var(--p)}

/* Contenido Principal */
.main{flex:1;overflow-y:auto;padding:20px 0;scroll-behavior:smooth}
.row{margin-bottom:30px}
.row-h{padding:0 25px 10px;font-size:20px;font-weight:bold}
.row-inner{display:flex;overflow-x:auto;padding:0 25px;gap:12px}
.row-inner::-webkit-scrollbar{display:none}

.card{flex:0 0 150px;aspect-ratio:2/3;background:var(--c);border-radius:10px;overflow:hidden;border:3px solid transparent;cursor:pointer;transition:0.2s}
.card.f{border-color:var(--p);transform:scale(1.05);z-index:5}
.card img{width:100%;height:100%;object-fit:cover;background:#222}

/* Player */
.player{position:fixed;inset:0;background:#000;z-index:1000;display:none;flex-direction:column}
.player.open{display:flex}
video{width:100%;flex:1}
.p-close{position:absolute;top:20px;right:20px;background:var(--p);color:#000;border:none;padding:10px 20px;border-radius:5px;font-weight:bold;cursor:pointer}

</style></head><body>

<div id="app">
    <div class="hdr">
        <div class="hdr-top">
            <div class="logo">MOVIES+</div>
            <input class="srch" id="srch" placeholder="Buscar película..." autocomplete="off">
        </div>
        <div class="cats-bar" id="catsBar">
            <div class="cat-chip active" data-cat="Todas">Todas</div>
            <!-- Categorías se cargan aquí -->
        </div>
    </div>

    <div class="main" id="main">
        <div id="content"></div>
    </div>

    <div class="player" id="player">
        <button class="p-close" onclick="closePlayer()">CERRAR (ESC)</button>
        <video id="vid" controls autoplay></video>
    </div>
</div>

<script>
const CATEGORIES = ${JSON.stringify(CATEGORY_LIST)};
const el = {
    content: document.getElementById('content'),
    catsBar: document.getElementById('catsBar'),
    srch: document.getElementById('srch'),
    player: document.getElementById('player'),
    vid: document.getElementById('vid')
};

let currentCat = 'Todas';

function init() {
    // Renderizar botones de categorías de la imagen
    CATEGORIES.forEach(cat => {
        const btn = document.createElement('div');
        btn.className = 'cat-chip';
        btn.textContent = cat;
        btn.onclick = () => filterByCat(cat);
        el.catsBar.appendChild(btn);
    });

    loadMovies();
    
    el.srch.oninput = () => loadMovies();
}

function filterByCat(cat) {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    currentCat = cat;
    loadMovies();
}

async function loadMovies() {
    const q = el.srch.value;
    const res = await fetch(\`/api/movies?q=\${encodeURIComponent(q)}&cat=\${currentCat === 'Todas' ? '' : currentCat}\`);
    const data = await res.json();
    render(data.categories);
}

function render(grouped) {
    el.content.innerHTML = '';
    if (Object.keys(grouped).length === 0) {
        el.content.innerHTML = '<div style="padding:50px;text-align:center;color:#888">No se encontraron películas en esta categoría</div>';
        return;
    }

    for (const [name, movies] of Object.entries(grouped)) {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = \`<div class="row-h">\${name}</div>\`;
        
        const inner = document.createElement('div');
        inner.className = 'row-inner';
        
        movies.forEach(m => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = \`<img src="\${m.poster}" loading="lazy">\`;
            card.onclick = () => playMovie(m);
            inner.appendChild(card);
        });
        
        row.appendChild(inner);
        el.content.appendChild(row);
    }
}

function playMovie(m) {
    let url = m.url;
    if(url.startsWith('http://') || location.protocol === 'https:') {
        url = '/video-proxy?url=' + encodeURIComponent(url);
    }
    el.vid.src = url;
    el.player.classList.add('open');
}

function closePlayer() {
    el.vid.pause();
    el.vid.src = "";
    el.player.classList.remove('open');
}

// Soporte Teclado Básico
window.onkeydown = (e) => {
    if (e.key === 'Escape') closePlayer();
};

init();
</script>
</body></html>`));

app.listen(PORT, '0.0.0.0', () => console.log('Servidor en puerto ' + PORT));
