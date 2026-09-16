/* =================================================_
   Global Variables & Initial Setup
   متغيرات النظام الأساسية والإعدادات العامة
   ================================================= */
let rawGames = [];
let filteredGames = [];
let displayedCount = 0;
const step = 24;
let activeGenre = 'all';
let searchQuery = '';
let activeFilter = 'all';
let currentGame = null;
let isKidsMode = false;
let bannerKiller;
let pwaPrompt = null;
let isLoading = false;

/* =================================================_
   Dynamic Data Loader (Files Management)
   دالة جلب وتوزيع ملفات الألعاب مع منع التكرار
   ================================================= */
function loadGamesData() {
    let targetFile = 'games.json';

    // قسم جديد يقرأ من ملفه الخاص
    if (activeFilter === 'new') {
        targetFile = 'new.json';
    }

    // للمفضلة واللي لعبتها: دمج الملفين مع تصفية الألعاب المكررة بناءً على الـ ID لمنع تكرار اللعبة مرتين
    if (activeFilter === 'favorites' || activeFilter === 'played') {
        Promise.all([
            fetch('games.json?v=' + Date.now()).then(res => res.json()),
            fetch('new.json?v=' + Date.now()).then(res => res.json())
        ])
        .then(([oldData, newData]) => {
            const oldHits = oldData.segments[0]?.hits || [];
            const newHits = newData.segments[0]?.hits || [];
            
            // دمج القائمتين معاً
            const combinedHits = [...oldHits, ...newHits];
            
            // إزالة الألعاب المكررة بالاعتماد على معرف اللعبة (id) لمنع تكرار العرض
            const uniqueHitsMap = new Map();
            combinedHits.forEach(game => {
                if (!uniqueHitsMap.has(game.id)) {
                    uniqueHitsMap.set(game.id, game);
                }
            });

            processGamesData({ segments: [{ hits: Array.from(uniqueHitsMap.values()) }] });
        })
        .catch(err => console.error("Error loading combined game files:", err));
        return;
    }

    // التحميل العادي لباقي الأقسام
    fetch(targetFile + '?v=' + Date.now())
        .then(res => {
            if(!res.ok) throw new Error(targetFile + ' not found');
            return res.json();
        })
        .then(data => {
            processGamesData(data);
        })
        .catch(err => {
            console.error("Failed to load games data:", err);
            const trigger = document.getElementById('loading-trigger');
            if(trigger) trigger.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Failed to load games. Check file paths.';
        });
}

/* =================================================_
   Process and Prepare Games Data
   معالجة وتحضير بيانات الألعاب المستخرجة
   ================================================= */
function processGamesData(data) {
    const hits = data.segments[0]?.hits || [];
    const todaySeed = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const dailyIndex = parseInt(todaySeed) % (hits.length || 1);

    rawGames = hits.map((g, i) => ({
        ...g, 
        playCount: parseInt(localStorage.getItem(`plays_${g.id}`) || 0), 
        isNew: activeFilter === 'new' ? true : (i < 5), 
        isDaily: i === dailyIndex
    }));

    const trigger = document.getElementById('loading-trigger');
    if(trigger) trigger.style.display = 'none';

    buildGenresBar(); 
    applyFilters(); 
    setupScrollButtons(); 
    buildFeaturedSlider(); 
    checkResumeBanner();
}

/* =================================================_
   PWA & Service Worker Setup
   إعدادات التطبيق وتخزين الخدمة
   ================================================= */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('Service Worker registered successfully:', reg.scope))
        .catch(err => console.log('Service Worker registration failed:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwaPrompt = e;
    const btnInstall = document.getElementById('btn-install');
    if (btnInstall && !isStandalone()) {
        btnInstall.style.display = 'inline-flex';
    }
});

window.addEventListener('appinstalled', () => {
    pwaPrompt = null;
    const btnInstall = document.getElementById('btn-install');
    if (btnInstall) btnInstall.classList.add('installed');
});

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setupPWAInstallButton() {
    const btnInstall = document.getElementById('btn-install');
    if (!btnInstall) return;
    if (isStandalone()) {
        btnInstall.classList.add('installed');
        return;
    }
    btnInstall.onclick = async () => {
        if (pwaPrompt) {
            pwaPrompt.prompt();
            const { outcome } = await pwaPrompt.userChoice;
            if (outcome === 'accepted') btnInstall.classList.add('installed');
            pwaPrompt = null;
        }
    };
}

/* =================================================_
   Platform Initialization
   بدء تشغيل المنصة عند التحميل
   ================================================= */
async function initPlatform() {
    try {
        setupPWAInstallButton();
        loadGamesData(); // استدعاء دالة التحميل الذكية

        killGoogleBannerForever();
        const savedLang = localStorage.getItem('fo_lang');
        if(savedLang && savedLang !== 'ar') setTimeout(() => selectLanguage(savedLang), 1500);

        window.addEventListener('scroll', handleScroll);
        window.addEventListener('hashchange', checkUrlHash);
    } catch (err) {
        console.error("Platform initialization error:", err);
    }
}

/* =================================================_
   UI Enhancements & Translation
   تحسينات واجهة المستخدم وإزالة إعلانات الترجمة
   ================================================= */
function killGoogleBannerForever() {
    bannerKiller = new MutationObserver(() => {
        document.querySelectorAll('.goog-te-banner-frame').forEach(f => f.remove());
        if(document.body.style.top !== '0px') document.body.style.top = '0px';
    });
    bannerKiller.observe(document.body, { childList: true, subtree: true });
}

function buildFeaturedSlider() {
    const container = document.getElementById('featured-slider-container');
    if (!container || rawGames.length === 0) return;
    const featured = rawGames.slice(0, 10);
    const fullList = [...featured, ...featured, ...featured];
    container.innerHTML = fullList.map(g => `<div class="slide-card" onclick="openGameById('${g.id}')"><img src="${g.images[0]}" loading="lazy"><div class="slide-overlay"><h4>${g.title}</h4></div></div>`).join('');
    container.classList.add('rtl-marquee');
}

function openTranslateModal() { document.getElementById('translateModal').style.display = 'flex'; }
function closeTranslateModal() { document.getElementById('translateModal').style.display = 'none'; }

function selectLanguage(langCode) {
    closeTranslateModal();
    let select = document.querySelector('.goog-te-combo');
    if(!select){ select = document.createElement('select'); select.className = 'goog-te-combo'; select.style.display = 'none'; document.body.appendChild(select); }
    select.innerHTML = '';
    ['ar','en','fr','de','es','ru'].forEach(l => { let opt = document.createElement('option'); opt.value = l; opt.innerText = l; select.appendChild(opt); });
    select.value = langCode;
    select.dispatchEvent(new Event('change'));
    localStorage.setItem('fo_lang', langCode);
    setTimeout(() => {
        document.querySelectorAll('.goog-te-banner-frame').forEach(iframe => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const style = doc.createElement('style');
                style.innerHTML = 'body{display:none!important}';
                doc.head.appendChild(style);
            } catch(e){}
            iframe.remove();
        });
        document.body.style.top = '0px';
        document.body.style.position = 'static';
    }, 500);
}

function sharePlatform() { 
    const url = window.location.href; 
    if (navigator.share) navigator.share({ title: 'FO.Games', text: 'Play amazing free games on FO.Games!', url: url }); 
    else navigator.clipboard.writeText(url).then(() => alert('Link copied!')); 
}

function toggleMainQRCode() { 
    const modal = document.getElementById('main-qr-modal'); 
    modal.style.display = modal.style.display === 'flex'? 'none' : 'flex'; 
    if (modal.style.display === 'flex') { 
        document.getElementById('main-qrcode').innerHTML = ''; 
        new QRCode(document.getElementById("main-qrcode"), { text: window.location.href, width: 160, height: 160 }); 
    } 
}

/* =================================================_
   Game Progress & Resume System
   نظام استئناف اللعبة والروابط المباشرة
   ================================================= */
function checkResumeBanner() {
    const lastId = localStorage.getItem('last_played_game');
    if(lastId) {
        const game = rawGames.find(g => g.id === lastId);
        if(game) {
            document.getElementById('resume-title').innerText = game.title;
            document.getElementById('resume-banner').style.display = 'flex';
        }
    }
}

function resumeLastGame() { const lastId = localStorage.getItem('last_played_game'); if(lastId) openGameById(lastId); }

function checkUrlHash() {
    if(window.location.hash.includes('#game=')) {
        const id = window.location.hash.split('#game=')[1];
        const game = rawGames.find(g => g.id === id);
        if(game) openGame(game, false);
        else { document.getElementById('page-404').style.display = 'block'; document.getElementById('games-holder').style.display = 'none'; }
    } else {
        closeGameModalUI();
    }
}

function close404() { document.getElementById('page-404').style.display = 'none'; document.getElementById('games-holder').style.display = 'grid'; window.location.hash = ''; }
function openGameById(id) { const g = rawGames.find(x => x.id === id); if(g) openGame(g); }

/* =================================================_
   Filtering & Navigation Elements (Fixed Tabs Integration)
   تصنيف الألعاب والتحكم بأزرار التبويبات العلوية
   ================================================= */
function buildGenresBar() { 
    const container = document.getElementById('genres-container'); 
    if (!container) return;
    const allGenres = new Set(); 
    rawGames.forEach(g => g.genres && g.genres.forEach(genre => allGenres.add(genre))); 
    let html = `<div class="genre-chip active" data-genre="all">Main</div>`; 
    allGenres.forEach(genre => { html += `<div class="genre-chip" data-genre="${genre}">${genre}</div>`; }); 
    container.innerHTML = html; 
    container.querySelectorAll('.genre-chip').forEach(c => c.onclick = () => filterByGenre(c.dataset.genre)); 
}

function filterByGenre(genre) { 
    activeGenre = genre; 
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.toggle('active', c.dataset.genre === genre)); 
    applyFilters(); 
}

// ربط أزرار الفلترة العلوية مع دالة تحميل البيانات الذكية
document.querySelectorAll('.filter-tab').forEach(tab => tab.onclick = () => { 
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active')); 
    tab.classList.add('active'); 
    activeFilter = tab.dataset.filter; 
    loadGamesData(); 
});

document.getElementById('search-input').addEventListener('input', (e) => { 
    searchQuery = e.target.value.toLowerCase().trim(); 
    applyFilters(); 
});

function applyFilters() {
    filteredGames = rawGames.filter(game => {
        const matchesGenre = activeGenre === 'all' || (game.genres && game.genres.includes(activeGenre));
        const matchesSearch = game.title.toLowerCase().includes(searchQuery) || (game.description && game.description.toLowerCase().includes(searchQuery));
        if(isKidsMode && game.genres && (game.genres.includes('action') || game.genres.includes('shooting') || game.genres.includes('horror'))) return false;
        
        let matchesFilter = true;
        if(activeFilter === 'new') matchesFilter = game.isNew; 
        if(activeFilter === 'played') matchesFilter = game.playCount > 0; 
        if(activeFilter === 'favorites') matchesFilter = isFavorite(game.id); 
        if(activeFilter === 'desktop') matchesFilter = game.mobileReady?.includes("For Desktop"); 
        if(activeFilter === 'mobile') matchesFilter = game.mobileReady?.includes("For Android") || game.mobileReady?.includes("For IOS");
        
        return matchesGenre && matchesSearch && matchesFilter;
    });
    displayedCount = 0;
    const holder = document.getElementById('games-holder');
    if (holder) {
        holder.innerHTML = '<div id="loading-trigger"><i class="fa-solid fa-circle-notch fa-spin"></i> <span>Loading games...</span></div>';
    }
    isLoading = false;
    renderBatch();
}

/* =================================================_
   Infinite Scroll & Batch Rendering
   التمرير اللانهائي ورسم البطاقات تدريجياً
   ================================================= */
function handleScroll() {
    const trigger = document.getElementById('loading-trigger');
    if(!trigger || isLoading) return;
    const rect = trigger.getBoundingClientRect();
    if(rect.top <= window.innerHeight + 200) {
        renderBatch();
    }
}

function renderBatch() {
    if(isLoading) return;
    isLoading = true;

    const grid = document.getElementById('games-holder');
    const trigger = document.getElementById('loading-trigger');
    if (!grid || !trigger) return;

    if(filteredGames.length === 0){
        trigger.innerHTML = '<i class="fa-solid fa-face-frown"></i> <span>No games found matching criteria</span>';
        isLoading = false;
        return;
    }

    const nextBatch = filteredGames.slice(displayedCount, displayedCount + step);
    nextBatch.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `<div class="media-holder"><img class="game-img" src="${game.images[0]}" alt="${game.title}" loading="lazy"><div class="card-badges">${game.isDaily? `<span class="badge daily-badge"><i class="fa-solid fa-star"></i> Daily Challenge</span>` : ''}<span class="badge"><i class="fa-solid ${game.screenOrientation?.horizontal?'fa-square-caret-right':'fa-mobile-screen-button'}"></i></span></div></div><div class="game-meta"><div class="game-title">${game.title}</div></div>`;
        card.onclick = () => openGame(game);
        grid.insertBefore(card, trigger);
    });

    displayedCount += step;

    if(displayedCount >= filteredGames.length) {
        trigger.innerHTML = '<i class="fa-solid fa-check"></i> <span>All games loaded</span>';
    }

    setTimeout(() => { isLoading = false }, 300);
}

/* =================================================_
   Game Execution & Modal Management
   تشغيل اللعبة وإدارة النافذة المنبثقة والروابط
   ================================================= */
function openGame(game, setHash = true) {
    currentGame = game; 
    game.playCount++; 
    localStorage.setItem(`plays_${game.id}`, game.playCount); 
    localStorage.setItem('last_played_game', game.id); 
    checkResumeBanner();

    if(setHash) {
        window.location.hash = `#game=${game.id}`;
    }

    document.getElementById('m-title').innerText = game.title; 
    
    const iframe = document.getElementById('gameIframe');
    iframe.src = game.gameURL; 

    document.getElementById('m-desc').innerText = game.description || '-'; 
    document.getElementById('m-howto').innerText = game.howToPlayText || '-'; 
    document.getElementById('m-orient').innerText = game.screenOrientation?.horizontal ? 'Landscape' : 'Portrait'; 
    document.getElementById('m-purchases').innerText = game.inGamePurchases === "Yes" ? 'Yes' : 'No'; 
    document.getElementById('m-devices').innerText = game.mobileReady ? game.mobileReady.join(', ') : 'All Devices'; 
    
    updateFavModalBtn();

    const tagsBox = document.getElementById('m-tags'); 
    tagsBox.innerHTML = ''; 
    if(game.tags) game.tags.forEach(t => {
        const el = document.createElement('span');
        el.className = 'tag-item';
        el.innerText = t;
        tagsBox.appendChild(el);
    });

    document.getElementById('gameModal').style.display = 'flex'; 
    document.body.style.overflow = 'hidden'; 
    document.getElementById('qr-container').style.display = 'none';
}

function closeGame(){ 
    if (window.location.hash.includes('#game=')) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    closeGameModalUI();
}

function closeGameModalUI() {
    const modal = document.getElementById('gameModal');
    if (modal) modal.style.display = 'none'; 
    const iframe = document.getElementById('gameIframe');
    if (iframe) iframe.src = 'about:blank'; 
    document.body.style.overflow = 'auto'; 
}

function updateFavModalBtn() {
    const btn = document.getElementById('btn-fav-modal');
    if (!btn || !currentGame) return;
    const isFav = isFavorite(currentGame.id);
    if (isFav) {
        btn.classList.add('active');
        btn.style.color = '#ef4444';
    } else {
        btn.classList.remove('active');
        btn.style.color = 'inherit';
    }
}

function toggleFavCurrent() {
    if (!currentGame) return;
    toggleFav(currentGame.id);
    updateFavModalBtn();
    if (activeFilter === 'favorites') {
        applyFilters();
    }
}

function playRandomGame() { 
    if(rawGames.length === 0) return; 
    const randomIndex = Math.floor(Math.random() * rawGames.length); 
    openGame(rawGames[randomIndex]); 
}

function shareCurrentGame() { 
    if(!currentGame) return; 
    const url = window.location.href.split('#')[0] + `#game=${currentGame.id}`; 
    if (navigator.share) navigator.share({ title: currentGame.title, text: `I play ${currentGame.title} on FO.Games!`, url: url }); 
    else navigator.clipboard.writeText(url).then(() => alert('Link copied!')); 
}

function toggleGameQRCode() { 
    const container = document.getElementById('qr-container'); 
    if(container.style.display === 'block') container.style.display = 'none'; 
    else { 
        container.style.display = 'block'; 
        document.getElementById('qrcode').innerHTML = ''; 
        const url = window.location.href.split('#')[0] + `#game=${currentGame.id}`; 
        new QRCode(document.getElementById("qrcode"), { text: url, width: 128, height: 128 }); 
    } 
}

function toggleTheme() { 
    document.body.classList.toggle('light-theme'); 
    const icon = document.getElementById('theme-icon'); 
    if(document.body.classList.contains('light-theme')) icon.className = 'fa-solid fa-sun'; 
    else icon.className = 'fa-solid fa-moon'; 
}

function toggleKidsMode() { 
    isKidsMode = !isKidsMode; 
    document.getElementById('kids-label').innerText = isKidsMode ? "Kids: On" : "Kids: Off"; 
    applyFilters(); 
}

function openFooterInfo(type) {
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('info-modal-title');
    const text = document.getElementById('info-modal-text');
    if(type === 'about') { title.innerText = "About FO.Games"; text.innerText = "FO.Games is your premier platform for free online gaming without downloads."; }
    else if(type === 'contact') { title.innerText = "Contact Us"; text.innerText = "For inquiries, reach out to us."; }
    else if(type === 'privacy') { title.innerText = "Privacy Policy"; text.innerText = "We value and protect your privacy."; }
    modal.style.display = 'flex';
}

/* =================================================_
   Responsive Navigation Menu UI
   أحداث القائمة الجانبية والشريط المتجاوب
   ================================================= */
const navbar = document.querySelector(".navbar");
const bars = document.querySelector(".fa-bars");
const xmark = document.querySelector(".fa-xmark");
const menudiv = document.querySelector(".menudiv");

if (menudiv) {
    menudiv.addEventListener("click", () => {
        bars.classList.toggle("active");
        xmark.classList.toggle("active");
        navbar.classList.toggle("active");
    });
}

const home = document.querySelector("#home");
const bars2 = document.querySelector(".fa-house");
const xmark2 = document.querySelector("#xmark2");
const home_font = document.querySelector("#home_font");

if (home_font) {
    home_font.addEventListener("click", () => {
        bars2.classList.toggle("active");
        xmark2.classList.toggle("active");
        home.classList.toggle("active");
    });
}

/* =================================================_
   Utilities & Event Listeners
   الأدوات المساعدة ومستمعي الأحداث العامة
   ================================================= */
const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.onclick = () => { 
        const el = document.getElementById('iframe-container'); 
        if(!document.fullscreenElement) el.requestFullscreen().catch(()=>{}); 
        else document.exitFullscreen(); 
    };
}

function setupScrollButtons(){ 
    const bar = document.getElementById('genres-container'); 
    if (!bar) return;
    const btnLeft = document.getElementById('scrollLeft');
    const btnRight = document.getElementById('scrollRight');
    if (btnLeft) btnLeft.onclick = () => bar.scrollBy({left: 300, behavior:'smooth'}); 
    if (btnRight) btnRight.onclick = () => bar.scrollBy({left: -300, behavior:'smooth'}); 
}

function isFavorite(id){ return JSON.parse(localStorage.getItem('favorites')||'[]').includes(id); }

function toggleFav(id){ 
    let favs = JSON.parse(localStorage.getItem('favorites')||'[]'); 
    if(favs.includes(id)){ favs = favs.filter(f => f !== id); } 
    else { favs.push(id); } 
    localStorage.setItem('favorites', JSON.stringify(favs)); 
}

// بدء تشغيل المنصة عند تحميل نافذة المتصفح بالكامل
window.onload = initPlatform;