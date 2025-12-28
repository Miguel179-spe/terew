const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let MOVIES = [];

// --- Configuración del PIN ---
const ACCESS_PIN = '1234'; // ¡Cambia esto por un PIN más seguro en producción!
let isPinValid = false; // Bandera para saber si el PIN ha sido validado

try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, process.env.DATA_FILE || 'data.json'), 'utf8'));
    MOVIES = data.map((m, i) => ({ id: i, title: m.title || 'Sin título', poster: m.logo || '', url: m.url || '' }));
    console.log(`✓ ${MOVIES.length} películas`);
} catch (e) { console.error('Error:', e.message); }

app.use(express.json()); // Para parsear cuerpos de solicitud JSON
app.use(express.urlencoded({ extended: true })); // Para parsear cuerpos de solicitud URL-encoded

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// --- Rutas de la Aplicación ---

// Ruta para la página de entrada del PIN
app.get('/pin', (req, res) => {
    if (isPinValid) {
        // Si el PIN ya es válido, redirigir directamente a la app
        return res.redirect('/');
    }
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Acceso Restringido</title>
            <style>
                body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { background: #1a1a1a; padding: 30px; border-radius: 8px; text-align: center; box-shadow: 0 0 20px rgba(0,0,0,0.5); }
                h1 { color: #f5c518; margin-bottom: 10px; font-size: 24px; }
                .pin-input-container { margin: 20px 0; }
                .pin-input {
                    display: inline-block;
                    width: 40px; height: 50px;
                    margin: 0 5px;
                    font-size: 24px;
                    text-align: center;
                    border: 2px solid #2a2a2a;
                    border-radius: 6px;
                    background: #0a0a0a;
                    color: #e0e0e0;
                    outline: none;
                    caret-color: #f5c518;
                }
                .pin-input:focus { border-color: #f5c518; }
                button {
                    background: #f5c518; color: #0a0a0a; border: none; padding: 12px 25px; border-radius: 6px;
                    font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;
                }
                button:hover { background: #e0ad15; }
                .error-message { color: #ff6b6b; margin-top: 15px; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>XXX</h1>
                <p style="color: #888; margin-bottom: 20px;">Ingresa el PIN de acceso</p>
                <div class="pin-input-container">
                    <input type="password" maxlength="1" class="pin-input" id="pin1" autocomplete="off">
                    <input type="password" maxlength="1" class="pin-input" id="pin2" autocomplete="off">
                    <input type="password" maxlength="1" class="pin-input" id="pin3" autocomplete="off">
                    <input type="password" maxlength="1" class="pin-input" id="pin4" autocomplete="off">
                </div>
                <button id="accessBtn">Acceder</button>
                <div id="errorMessage" class="error-message" style="display: none;">PIN incorrecto. Inténtalo de nuevo.</div>
            </div>

            <script>
                const pinInputs = [document.getElementById('pin1'), document.getElementById('pin2'), document.getElementById('pin3'), document.getElementById('pin4')];
                const accessBtn = document.getElementById('accessBtn');
                const errorMessage = document.getElementById('errorMessage');

                pinInputs.forEach((input, index) => {
                    input.addEventListener('input', () => {
                        if (input.value.length === 1) {
                            if (index < pinInputs.length - 1) {
                                pinInputs[index + 1].focus();
                            } else {
                                // Último dígito, intentar acceder
                                accessBtn.focus();
                            }
                        }
                    });

                    // Manejar tecla de borrar
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
                            pinInputs[index - 1].focus();
                        }
                    });

                    // Permitir solo números (opcional, pero buena práctica)
                    input.addEventListener('keypress', (e) => {
                        if (e.key.length === 1 && (e.key < '0' || e.key > '9')) {
                            e.preventDefault();
                        }
                    });
                });

                accessBtn.addEventListener('click', async () => {
                    const pin = pinInputs.map(inp => inp.value).join('');
                    if (pin.length === 4) {
                        try {
                            const response = await fetch('/verify-pin', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ pin })
                            });

                            if (response.ok) {
                                window.location.href = '/'; // Redirigir a la app principal
                            } else {
                                errorMessage.style.display = 'block';
                                pinInputs.forEach(inp => inp.value = ''); // Limpiar campos
                                pinInputs[0].focus(); // Volver al primer campo
                            }
                        } catch (error) {
                            console.error('Error de red al verificar PIN:', error);
                            errorMessage.textContent = 'Error de conexión. Inténtalo de nuevo.';
                            errorMessage.style.display = 'block';
                        }
                    } else {
                        errorMessage.textContent = 'Por favor, ingresa un PIN de 4 dígitos.';
                        errorMessage.style.display = 'block';
                    }
                });

                // Enfocar el primer campo al cargar
                pinInputs[0].focus();

                // Permitir presionar Enter para acceder
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && document.activeElement === accessBtn) {
                        accessBtn.click();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Ruta para verificar el PIN
app.post('/verify-pin', (req, res) => {
    const { pin } = req.body;

    if (pin === ACCESS_PIN) {
        isPinValid = true; // Marcar PIN como válido
        res.sendStatus(200); // OK
    } else {
        res.status(401).send('PIN incorrecto'); // Unauthorized
    }
});

// Ruta principal de la aplicación
app.get('/', (req, res) => {
    if (!isPinValid) {
        // Si el PIN no es válido, redirigir a la página de PIN
        return res.redirect('/pin');
    }
    // Si el PIN es válido, servir la aplicación principal
    res.send(`<!DOCTYPE html><html lang="es"><head>
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
    headerElements:[], // Logo, Search, Mix - en orden de navegación
    headerIndex:0 // Índice actual en el header
};

// ===== INICIALIZACIÓN =====
// Modificación: Solo redirigir a /pin si el PIN no es válido
if (!window.location.pathname.startsWith('/pin') && !<%= isPinValid %>) { // Utiliza una variable del backend si es posible
    window.location.href = '/pin';
}

history.replaceState({v:'home'},'','#home');
window.onpopstate=()=>{if(S.view==='player'){closeP();history.pushState({v:'home'},'','#home')}};

function init() {
    // Configurar elementos del header
    S.headerElements = [el.logo, el.srch, el.mix];

    fetch('/api/movies?limit=200&random=true').then(r=>r.json()).then(d=>{
        el.stats.textContent=d.total+' películas';
        el.grid.innerHTML='';
        S.movies=d.data;
        d.data.forEach(m=>el.grid.appendChild(mkCard(m)));

        // Calcular columnas del grid
        calculateGridColumns();

        // Inicializar lazy loading
        initLazyLoading();

        // Enfocar logo inicialmente
        setFocusHeader(0);

    }).catch(()=>el.grid.innerHTML='<div class="msg">Error</div>');
}

// ===== LAZY LOADING CON ANIMACIÓN SUAVE =====
function initLazyLoading() {
    if(S.imgObserver) S.imgObserver.disconnect();

    S.imgObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if(entry.isIntersecting){
                const img = entry.target;
                if(img.dataset.src && !img.classList.contains('loaded')) {
                    loadImageWithAnimation(img);
                }
                S.imgObserver.unobserve(img);
            }
        });
    }, {
        rootMargin: '300px 0px', // Cargar antes de que entren al viewport
        threshold: 0.01
    });

    // Observar todas las imágenes
    document.querySelectorAll('.card img[data-src]').forEach(img => {
        S.imgObserver.observe(img);
    });
}

function loadImageWithAnimation(img) {
    if(!img.dataset.src) return;

    const src = img.dataset.src;
    const imgEl = new Image();

    imgEl.onload = () => {
        img.src = src;
        // Forzar reflow para activar la animación
        void img.offsetWidth;
        img.classList.add('loaded');
        img.style.background = 'none';
    };

    imgEl.onerror = () => {
        // Usar placeholder SVG con animación
        img.src = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" viewBox="0 0 130 195">' +
            '<rect width="130" height="195" fill="#1a1a1a"/>' +
            '<text x="65" y="95" font-family="Arial" font-size="12" fill="#888" text-anchor="middle">Sin imagen</text>' +
            '</svg>'
        );
        img.classList.add('loaded');
        img.style.background = 'none';
    };

    // Pequeño delay para mostrar la animación de carga
    setTimeout(() => {
        imgEl.src = src;
    }, 100);
}

function preloadAdjacentImages(index) {
    const cards = getCards();
    if(!cards.length) return;

    // Cargar imágenes en un radio de 2 elementos
    for(let i = Math.max(0, index - 2); i <= Math.min(cards.length - 1, index + 2); i++) {
        const img = cards[i].querySelector('img[data-src]');
        if(img && img.dataset.src && !img.classList.contains('loaded')) {
            loadImageWithAnimation(img);
        }
    }
}

// ===== SISTEMA DE NAVEGACIÓN UNIFICADO =====
function getCards() {
    return [...el.grid.querySelectorAll('.card')];
}

function calculateGridColumns() {
    const grid = el.grid;
    if(!grid.children.length) {
        S.gridCols = 0;
        return;
    }

    // Método simple: contar elementos en la primera fila
    const firstCard = grid.children[0];
    const firstRect = firstCard.getBoundingClientRect();
    let cols = 1;

    for(let i = 1; i < grid.children.length; i++) {
        const rect = grid.children[i].getBoundingClientRect();
        if(Math.abs(rect.top - firstRect.top) < 10) {
            cols++;
        } else {
            break;
        }
    }

    S.gridCols = Math.max(1, cols);
}

// ===== MANEJO DE FOCUS =====
function setFocusHeader(index) {
    if(index < 0) index = 0;
    if(index >= S.headerElements.length) index = S.headerElements.length - 1;

    // Remover focus anterior
    if(S.focus && S.focus.classList) S.focus.classList.remove('f');

    // Actualizar estado
    S.headerIndex = index;
    S.focus = S.headerElements[index];
    S.currentIndex = -1; // Resetear índice de grid

    // Aplicar focus
    S.focus.classList.add('f');

    // Focus nativo para input
    if(S.focus === el.srch) {
        el.srch.focus();
    } else {
        el.srch.blur();
    }
}

function setFocusGrid(index) {
    const cards = getCards();
    if(index < 0) index = 0;
    if(index >= cards.length) index = cards.length - 1;

    // Remover focus anterior
    if(S.focus && S.focus.classList) S.focus.classList.remove('f');

    // Actualizar estado
    S.currentIndex = index;
    S.focus = cards[index];
    S.headerIndex = -1; // Resetear índice de header

    // Aplicar focus
    cards[index].classList.add('f');

    // Scroll suave
    const card = cards[index];
    const mainRect = el.main.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    if(cardRect.top < mainRect.top || cardRect.bottom > mainRect.bottom) {
        card.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }

    // Pre-cargar imágenes adyacentes
    preloadAdjacentImages(index);
}

function navigateGrid(direction) {
    const cards = getCards();
    if(!cards.length) return false;

    let newIndex = S.currentIndex;

    switch(direction) {
        case 'up':
            if(S.currentIndex < S.gridCols) {
                // Ir al header (botón mix)
                setFocusHeader(2);
                return true;
            }
            newIndex = Math.max(0, S.currentIndex - S.gridCols);
            break;
        case 'down':
            newIndex = Math.min(cards.length - 1, S.currentIndex + S.gridCols);
            break;
        case 'left':
            if(S.currentIndex % S.gridCols === 0) {
                // Primera columna, ir al header (search)
                setFocusHeader(1);
                return true;
            }
            newIndex = Math.max(0, S.currentIndex - 1);
            break;
        case 'right':
            if((S.currentIndex + 1) % S.gridCols === 0 || S.currentIndex === cards.length - 1) {
                // Última columna, no hacer nada o loop
                return false;
            }
            newIndex = Math.min(cards.length - 1, S.currentIndex + 1);
            break;
    }

    if(newIndex !== S.currentIndex) {
        setFocusGrid(newIndex);
        return true;
    }

    return false;
}

function navigateHeader(direction) {
    let newIndex = S.headerIndex;

    switch(direction) {
        case 'left':
            newIndex = Math.max(0, S.headerIndex - 1);
            break;
        case 'right':
            newIndex = Math.min(S.headerElements.length - 1, S.headerIndex + 1);
            break;
        case 'down':
            // Ir a la primera card del grid
            const cards = getCards();
            if(cards.length > 0) {
                setFocusGrid(0);
                return true;
            }
            break;
        case 'up':
            // No hay nada arriba del header
            return false;
    }

    if(newIndex !== S.headerIndex) {
        setFocusHeader(newIndex);
        return true;
    }

    return false;
}

// ===== MANEJO DE TECLADO =====
document.onkeydown = e => {
    const k = e.key;

    // Prevenir comportamiento por defecto para teclas de navegación
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ','Escape','Backspace','Tab'].includes(k)){
        e.preventDefault();
        e.stopPropagation();
    }

    if(S.view === 'player'){
        playerKey(k);
        return;
    }

    // Evitar que Tab cambie el focus
    if(k === 'Tab') {
        e.preventDefault();
        if(S.focus === el.srch) {
            // Si estamos en search, ir al siguiente elemento del header
            navigateHeader('right');
        } else {
            // Por defecto, ir al primer elemento del header
            setFocusHeader(0);
        }
        return;
    }

    // Acceso a la app principal si estamos en la página de PIN
    if(window.location.pathname.startsWith('/pin')) {
        // La lógica para el PIN ya está en el script de la página /pin
        return;
    }

    // Navegación normal si ya estamos en la app principal
    nav(k);
};

function nav(k) {
    // Activar elemento seleccionado
    if(k === 'Enter' || k === ' ') {
        if(S.focus === el.logo) {
            // Recargar página
            location.reload();
        } else if(S.focus === el.srch) {
            el.srch.focus();
            // Si hay texto, ejecutar búsqueda
            if(el.srch.value.trim()) {
                loadMovies(false);
            }
        } else if(S.focus === el.mix) {
            loadMovies(true);
        } else if(S.focus && S.focus.classList.contains('card')) {
            const idx = [...el.grid.querySelectorAll('.card')].indexOf(S.focus);
            if(idx >= 0 && S.movies[idx]) play(S.movies[idx]);
        }
        return;
    }

    // Escape para limpiar búsqueda
    if(k === 'Escape') {
        if(el.srch.value.trim()) {
            el.srch.value = '';
            loadMovies(false);
        } else if(S.currentIndex >= 0) {
            // Si estamos en el grid, ir al header
            setFocusHeader(2); // Ir al botón mix
        }
        return;
    }

    // Backspace
    if(k === 'Backspace') {
        if(S.focus === el.srch && el.srch.value.length > 0) {
            // Permitir borrar en el input
            return;
        } else if(S.currentIndex >= 0) {
            // Si estamos en el grid, ir al header
            setFocusHeader(2);
        }
        return;
    }

    // Navegación con flechas
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) {
        const direction = k.toLowerCase().replace('arrow', '');

        if(S.currentIndex >= 0) {
            // Estamos en el grid
            if(!navigateGrid(direction) && direction === 'right') {
                // Si no se pudo navegar en el grid y es derecha, ir al header
                setFocusHeader(0);
            }
        } else if(S.headerIndex >= 0) {
            // Estamos en el header
            if(!navigateHeader(direction) && direction === 'left' && S.headerIndex === 0) {
                // Si estamos en el logo y vamos a la izquierda, loop al final del grid
                const cards = getCards();
                if(cards.length > 0) {
                    setFocusGrid(cards.length - 1);
                }
            }
        } else {
            // Sin focus, empezar en el header
            setFocusHeader(0);
        }
    }
}

// Eventos de focus para elementos del header
el.logo.addEventListener('focus', () => setFocusHeader(0));
el.srch.addEventListener('focus', () => setFocusHeader(1));
el.mix.addEventListener('focus', () => setFocusHeader(2));

// Clic en logo para recargar
el.logo.addEventListener('click', () => location.reload());

// ===== BÚSQUEDA Y CARGA DE PELÍCULAS =====
let searchTimer;
el.srch.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadMovies(false), 400);
};

el.mix.onclick = () => loadMovies(true);

function loadMovies(random) {
    el.grid.innerHTML = '<div class="msg load">Cargando</div>';
    const q = el.srch.value.trim();
    fetch('/api/movies?limit=200' + (q ? '&q=' + encodeURIComponent(q) : '') + (random ? '&random=true' : ''))
        .then(r => r.json())
        .then(d => {
            el.grid.innerHTML = '';
            S.movies = d.data;
            S.currentIndex = -1;

            // Crear cards con animación escalonada
            d.data.forEach((m, i) => {
                setTimeout(() => {
                    el.grid.appendChild(mkCard(m));
                }, i * 10); // Pequeño delay para animación escalonada
            });

            // Calcular columnas y reinicializar lazy loading
            setTimeout(() => {
                calculateGridColumns();
                initLazyLoading();

                // Enfocar primera card si hay resultados
                const cards = getCards();
                if(cards.length > 0) {
                    setFocusGrid(0);
                } else {
                    // Si no hay resultados, mantener focus en search
                    setFocusHeader(1);
                }
            }, 100);
        })
        .catch(() => {
            el.grid.innerHTML = '<div class="msg">Error al cargar</div>';
            setFocusHeader(1);
        });
}

function mkCard(m) {
    const d = document.createElement('div');
    d.className = 'card';
    d.tabIndex = -1;

    const posterSrc = m.poster || '';
    d.innerHTML = '<img data-src="' + esc(posterSrc) + '" alt="' + esc(m.title) + '">' +
                  '<div class="card-t">' + esc(m.title) + '</div>';

    d.onclick = () => {
        const idx = [...el.grid.querySelectorAll('.card')].indexOf(d);
        if(idx >= 0 && S.movies[idx]) play(S.movies[idx]);
    };

    return d;
}

// ===== REPRODUCTOR =====
function play(m) {
    S.lastFocus = S.focus;
    S.view = 'player';
    S.retry = 0;
    // No usar history.pushState aquí si ya estamos redirigiendo desde /
    // history.pushState({v:'player'},'','#player');
    el.pErr.classList.remove('show');
    el.pLoad.classList.add('show');
    el.pLoadTxt.textContent = 'Conectando...';
    el.pTitle.textContent = m.title;
    el.player.classList.add('open');
    el.vid.pause();
    el.vid.removeAttribute('src');
    el.vid.load();

    setTimeout(() => {
        let u = m.url;
        // Importante: La lógica del proxy debe funcionar con el nuevo servidor
        // Asumiendo que el proxy sigue en /video-proxy
        if(u.startsWith('http://') || u.startsWith('https://') || location.protocol === 'https:') {
            u = '/video-proxy?url=' + encodeURIComponent(u);
        }
        el.vid.src = u;
        el.vid.play().catch(playErr);
        showUI();
    }, 50);
}

function closeP() {
    el.vid.pause();
    el.vid.removeAttribute('src');
    el.vid.load();
    el.player.classList.remove('open');
    S.view = 'home';

    setTimeout(() => {
        // Restaurar focus a donde estaba
        if(S.lastFocus && S.lastFocus.classList) {
            if(S.lastFocus.classList.contains('card')) {
                const cards = getCards();
                const idx = cards.indexOf(S.lastFocus);
                if(idx >= 0) {
                    setFocusGrid(idx);
                } else {
                    setFocusHeader(0);
                }
            } else {
                // Es un elemento del header
                const idx = S.headerElements.indexOf(S.lastFocus);
                if(idx >= 0) {
                    setFocusHeader(idx);
                } else {
                    setFocusHeader(0);
                }
            }
        } else {
            setFocusHeader(0);
        }
    }, 50);
}

el.vid.onloadstart = () => {
    el.pLoad.classList.add('show');
    el.pErr.classList.remove('show');
    el.pLoadTxt.textContent = 'Conectando...';
};

el.vid.oncanplay = () => {
    el.pLoad.classList.remove('show');
    S.retry = 0;
};

el.vid.onwaiting = () => {
    el.pLoad.classList.add('show');
    el.pLoadTxt.textContent = 'Buffering...';
};

el.vid.onplaying = () => {
    el.pLoad.classList.remove('show');
    S.playing = true;
    el.pPp.textContent = '⏸';
};

el.vid.onpause = () => {
    S.playing = false;
    el.pPp.textContent = '▶';
};

el.vid.ontimeupdate = () => {
    if(!el.vid.duration) return;
    el.pFill.style.width = (el.vid.currentTime / el.vid.duration * 100) + '%';
    el.pCur.textContent = fmt(el.vid.currentTime);
};

el.vid.ondurationchange = () => el.pDur.textContent = fmt(el.vid.duration);

el.vid.onprogress = () => {
    try {
        if(el.vid.buffered.length) {
            el.pBuf.style.width = (el.vid.buffered.end(el.vid.buffered.length - 1) / el.vid.duration * 100) + '%';
        }
    } catch(e) {}
};

el.vid.onerror = () => {
    const err = el.vid.error;
    el.pErrTxt.textContent = err ? ['','Abortado','Red','Decode','No soportado'][err.code] || 'Error' : 'Error';
    if(err && err.code === 2 && S.retry < 2) {
        S.retry++;
        el.pLoadTxt.textContent = 'Reintentando...';
        setTimeout(retry, 1500);
    } else {
        el.pLoad.classList.remove('show');
        el.pErr.classList.add('show');
    }
};

el.vid.onended = () => {
    S.playing = false;
    el.pPp.textContent = '▶';
    showUI();
};

function playErr(e) {
    if(e.name === 'NotAllowedError') showUI();
    else if(e.name === 'NotSupportedError') {
        el.pErrTxt.textContent = 'No soportado';
        el.pErr.classList.add('show');
        el.pLoad.classList.remove('show');
    }
}

function retry() {
    el.pErr.classList.remove('show');
    el.pLoad.classList.add('show');
    const t = el.vid.currentTime || 0;
    el.vid.pause();
    el.vid.load();
    setTimeout(() => {
        el.vid.currentTime = t;
        el.vid.play().catch(playErr);
    }, 300);
}

function playerKey(k) {
    showUI();
    if(k === 'ArrowLeft') seek(-10);
    else if(k === 'ArrowRight') seek(10);
    else if(k === 'ArrowUp') vol(.1);
    else if(k === 'ArrowDown') vol(-.1);
    else if(k === 'Enter' || k === ' ') toggle();
    else if(k === 'Escape' || k === 'Backspace') history.back();
}

function toggle() {
    if(el.vid.paused) {
        el.vid.play().catch(playErr);
        showInd('▶');
    } else {
        el.vid.pause();
        showInd('⏸');
    }
}

function seek(s) {
    if(!el.vid.duration) return;
    el.vid.currentTime = Math.max(0, Math.min(el.vid.currentTime + s, el.vid.duration));
    showInd((s > 0 ? '+' : '') + s + 's');
}

function vol(d) {
    try {
        el.vid.volume = Math.max(0, Math.min(1, el.vid.volume + d));
    } catch(e) {}
}

let hideT, indT;
function showInd(t) {
    el.pInd.textContent = t;
    el.pInd.classList.add('show');
    clearTimeout(indT);
    indT = setTimeout(() => el.pInd.classList.remove('show'), 500);
}

function showUI() {
    el.pUi.classList.remove('hide');
    clearTimeout(hideT);
    hideT = setTimeout(() => {
        if(S.playing) el.pUi.classList.add('hide');
    }, 3000);
}

function fmt(s) {
    if(!s || !isFinite(s)) return '0:00';
    const h = ~~(s / 3600);
    const m = ~~(s % 3600 / 60);
    const ss = ~~(s % 60);
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0') : m + ':' + String(ss).padStart(2, '0');
}

// Eventos del reproductor
el.pPp.onclick = toggle;
el.pRw.onclick = () => seek(-10);
el.pFw.onclick = () => seek(10);
el.pBar.onclick = e => {
    const r = el.pBar.getBoundingClientRect();
    if(el.vid.duration) el.vid.currentTime = (e.clientX - r.left) / r.width * el.vid.duration;
};
el.pRetry.onclick = retry;
el.pBack.onclick = () => history.back();
el.player.onclick = e => {
    if(e.target === el.vid) {
        toggle();
        showUI();
    }
};
el.player.onmousemove = showUI;

let tx, ty;
el.vid.ontouchstart = e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
};
el.vid.ontouchend = e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if(Math.abs(dx) > 50 && Math.abs(dy) < 50) seek(dx > 0 ? 10 : -10);
    else showUI();
};
el.pBar.ontouchstart = el.pBar.ontouchmove = e => {
    e.preventDefault();
    const r = el.pBar.getBoundingClientRect();
    if(el.vid.duration) {
        el.vid.currentTime = Math.max(0, Math.min(1, (e.touches[0].clientX - r.left) / r.width)) * el.vid.duration;
    }
};

function esc(s) {
    return s ? String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]) : '';
}

// Iniciar aplicación
init();

// Recalcular columnas al redimensionar
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        calculateGridColumns();
    }, 150);
});
})();
</script></body></html>`);
});

// Ruta para el proxy de video (sin cambios)
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

app.listen(PORT, '0.0.0.0', () => console.log('🎬 Movies+ → Puerto ' + PORT + ' | ' + MOVIES.length + ' películas'));