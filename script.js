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

    if (activeFilter === 'new') {
        targetFile = 'new.json';
    }

    if (activeFilter === 'favorites' || activeFilter === 'played') {
        Promise.all([
            fetch('games.json?v=' + Date.now()).then(res => res.json()),
            fetch('new.json?v=' + Date.now()).then(res => res.json())
        ])
        .then(([oldData, newData]) => {
            const oldHits = oldData.segments[0]?.hits || [];
            const newHits = newData.segments[0]?.hits || [];
            
            const combinedHits = [...oldHits, ...newHits];
            
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

    // فتح اللعبة مباشرة إذا كان الرابط يحتوي على #game=ID
    checkUrlHash();
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
        loadGamesData();

        killGoogleBannerForever();
        const savedLang = localStorage.getItem('fo_lang');
        if(savedLang && savedLang !== 'ar') setTimeout(() => selectLanguage(savedLang), 1500);

        window.addEventListener('scroll', handleScroll);
        window.addEventListener('hashchange', checkUrlHash);

        // تشغيل نظام التعليمات التفاعلي للزائر الجديد
        initTutorial();
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
   Filtering & Navigation Elements
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
   Interactive Tutorial & Onboarding System Logic
   منطق نظام التعليمات التفاعلي والجولة الإرشادية
   ================================================= */
const tutorialSteps = [
    { element: ".logo", title: "شعار المنصة | Platform Logo", text: "اضغط على شعار FO.Games للعودة للصفحة الرئيسية في أي وقت. | Tap the FO.Games logo anytime to return to the home page." },
    { element: ".search-box", title: "البحث عن الألعاب | Game Search", text: "اكتب اسم اللعبة أو كلمة للعثور على الألعاب بسرعة. | Type a game name or keyword to find games quickly." },
    { element: "#btn-random", title: "لعبة عشوائية | Lucky Play", text: "اضغط هنا لفتح لعبة عشوائية مباشرة. | Tap here to open a random game instantly." },
    { element: "#btn-kids", title: "وضع الأطفال | Kids Mode", text: "شغّل أو أوقف وضع الأطفال لعرض الألعاب المناسبة له. | Turn Kids Mode on or off to filter suitable games." },
    { element: "#btn-share-platform", title: "مشاركة المنصة | Share Platform", text: "استخدم زر المشاركة لإرسال FO.Games لأصدقائك. | Use Share to send FO.Games to your friends." },
    { element: "#btn-qr-platform", title: "رمز QR للمنصة | Platform QR", text: "يفتح هذا الزر رمز QR للوصول إلى FO.Games بسهولة من الهاتف. | This button opens a QR code for easy access to FO.Games on mobile." },
    { element: "#btn-theme", title: "الوضع الفاتح والداكن | Light / Dark Theme", text: "بدّل بين المظهر الفاتح والداكن في أي وقت. | Switch between Light and Dark themes anytime." },
    { element: ".btn-translate-custom", title: "الترجمة | Translation", text: "افتح نافذة اللغات واختر اللغة التي تريدها للواجهة. | Open the language window and choose your preferred interface language." },
    { element: ".filter-tabs", title: "الفلاتر والتصنيفات | Filters & Categories", text: "استخدم هذه التبويبات لعرض الألعاب الرئيسية والجديدة والمفضلة والموبايل والكمبيوتر. | Use these tabs to browse Main, New, Played, Favorites, Desktop and Mobile games." },
    { element: "#genres-container", title: "أنواع الألعاب | Game Genres", text: "اختر نوعًا لتصفية الألعاب المعروضة. | Choose a genre to narrow the games shown." },
    { element: "#btn-fullscreen", title: "ملء الشاشة | Fullscreen", text: "داخل اللعبة، اضغط هنا لتكبير منطقة اللعب. | Inside a game, tap here to make the game area fullscreen." },
    { element: "#btn-share", title: "مشاركة اللعبة | Share Game", text: "شارك اللعبة الحالية مع الآخرين. على الهاتف قد تظهر نافذة المشاركة الخاصة بالنظام. | Share the current game. On mobile, the system share sheet may appear." },
    { element: "#btn-fav-modal", title: "المفضلة | Favorites", text: "اضغط على القلب لإضافة اللعبة للمفضلة أو إزالتها منها. | Tap the heart to add or remove the game from Favorites." },
    { element: "#btn-tutorial-hint", title: "زر الشرح | Guide Button", text: "يمكنك فتح هذا الشرح مرة أخرى من زر Guide في أي وقت. | You can replay this guide anytime using the Guide button." }
];

let currentTutorialIndex = 0;
let tutorialPanels = [];
let tutorialResizeTimer = null;
let tutorialStepTimer = null;
let tutorialFocusRing = null;

function initTutorial() {
    if (!localStorage.getItem('fo_tutorial_seen')) {
        setTimeout(() => startTutorial(), 1200);
    }
}

function startTutorial() {
    currentTutorialIndex = 0;
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.classList.add('tutorial-running');
    ensureTutorialPanels();
    prepareTutorialStep(0);
}

function endTutorial() {
    clearTimeout(tutorialStepTimer);
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.style.display = 'none';
    clearTutorialHighlights();
    clearTutorialPanels();
    if (tutorialFocusRing) tutorialFocusRing.style.display = 'none';
    closeTutorialExtraModals();
    closeGameModalUI();
    closeTutorialMobileMenu();
    document.body.classList.remove('tutorial-running');
    localStorage.setItem('fo_tutorial_seen', 'true');
}

function ensureTutorialPanels() {
    const backdrop = document.getElementById('tutorial-backdrop-blur');
    if (!backdrop || tutorialPanels.length) return;
    backdrop.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const panel = document.createElement('div');
        panel.className = 'tutorial-blur-panel';
        panel.setAttribute('aria-hidden', 'true');
        backdrop.appendChild(panel);
        tutorialPanels.push(panel);
    }
}

function ensureTutorialFocusRing() {
    if (tutorialFocusRing && document.body.contains(tutorialFocusRing)) return tutorialFocusRing;
    tutorialFocusRing = document.createElement('div');
    tutorialFocusRing.id = 'tutorial-focus-ring';
    tutorialFocusRing.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tutorialFocusRing);
    return tutorialFocusRing;
}

function clearTutorialPanels() {
    tutorialPanels.forEach(panel => panel.style.cssText = '');
    if (tutorialFocusRing) tutorialFocusRing.style.cssText = 'display:none;';
}

function positionTutorialPanels(rect) {
    if (!rect) return;
    ensureTutorialPanels();
    const pad = window.innerWidth <= 640 ? 6 : 8;
    const left = Math.max(0, rect.left - pad);
    const top = Math.max(0, rect.top - pad);
    const right = Math.min(window.innerWidth, rect.right + pad);
    const bottom = Math.min(window.innerHeight, rect.bottom + pad);
    const ring = ensureTutorialFocusRing();
    ring.style.cssText = `display:block;left:${left}px;top:${top}px;width:${Math.max(0,right-left)}px;height:${Math.max(0,bottom-top)}px;`;
    const [topPanel, rightPanel, bottomPanel, leftPanel] = tutorialPanels;
    topPanel.style.cssText = `left:0;top:0;width:100vw;height:${top}px;`;
    rightPanel.style.cssText = `left:${right}px;top:${top}px;width:${Math.max(0,window.innerWidth-right)}px;height:${Math.max(0,bottom-top)}px;`;
    bottomPanel.style.cssText = `left:0;top:${bottom}px;width:100vw;height:${Math.max(0,window.innerHeight-bottom)}px;`;
    leftPanel.style.cssText = `left:0;top:${top}px;width:${left}px;height:${Math.max(0,bottom-top)}px;`;
}

function clearTutorialHighlights() {
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
}

function isTutorialGameStep(index) { return index >= 10 && index <= 12; }

function closeTutorialMobileMenu() {
    const navbar = document.querySelector('.navbar');
    const bars = document.querySelector('.menudiv .fa-bars');
    const xmark = document.querySelector('.menudiv #xmark');
    if (navbar && window.innerWidth <= 966) navbar.classList.remove('active');
    if (bars && window.innerWidth <= 966) bars.classList.add('active');
    if (xmark && window.innerWidth <= 966) xmark.classList.remove('active');
}

function openTutorialMobileMenuIfNeeded() {
    const navbar = document.querySelector('.navbar');
    if (navbar && window.innerWidth <= 966) {
        navbar.classList.add('active');
        const bars = document.querySelector('.menudiv .fa-bars');
        const xmark = document.querySelector('.menudiv #xmark');
        if (bars) bars.classList.remove('active');
        if (xmark) xmark.classList.add('active');
    }
}

function closeTutorialExtraModals() {
    ['translateModal', 'main-qr-modal', 'infoModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const qr = document.getElementById('qr-container');
    if (qr) qr.style.display = 'none';
}

function prepareTutorialStep(index) {
    clearTimeout(tutorialStepTimer);
    clearTutorialHighlights();
    clearTutorialPanels();
    if (tutorialFocusRing) tutorialFocusRing.style.display = 'none';
    closeTutorialExtraModals();

    // Steps 1-9 stay exactly as they are. From step 10 onward, open the
    // real UI that the tutorial is pointing at instead of creating fake elements.
    // Step 10 = the real game-genres bar.
    if (index === 9) {
        closeGameModalUI();
        const home = document.getElementById('home');
        const houseIcon = document.querySelector('#house');
        const closeIcon = document.getElementById('xmark2');
        if (home) home.classList.add('active');
        if (houseIcon) houseIcon.classList.remove('active');
        if (closeIcon) closeIcon.classList.add('active');
        const genres = document.getElementById('genres-container');
        if (genres) {
            genres.style.visibility = 'visible';
            genres.style.opacity = '1';
            genres.style.display = 'grid';
        }
        // Data normally exists by now, but rebuild if the bar is empty.
        if (genres && !genres.querySelector('.genre-chip') && rawGames.length) {
            buildGenresBar();
        }
    } else if (isTutorialGameStep(index)) {
        // Close the genres/categories panel before moving to game controls.
        // This prevents the Play/Resume area from appearing above the categories.
        const homePanel = document.getElementById('home');
        const houseIcon = document.querySelector('#home_font .fa-house');
        const closeIcon = document.getElementById('xmark2');
        if (homePanel) {
            homePanel.classList.remove('active');
            homePanel.style.opacity = '';
            homePanel.style.pointerEvents = '';
        }
        if (houseIcon) houseIcon.classList.add('active');
        if (closeIcon) closeIcon.classList.remove('active');

        const gameModal = document.getElementById('gameModal');
        const game = currentGame || rawGames?.[0];
        if (game && (!gameModal || getComputedStyle(gameModal).display === 'none')) {
            openGame(game, false);
        }
        const modal = document.getElementById('gameModal');
        if (modal) {
            modal.style.zIndex = '9000000102';
            modal.scrollTop = 0;
        }
    } else {
        closeGameModalUI();
    }

    // Mobile navigation controls are hidden until the hamburger menu is opened.
    if (index >= 2 && index <= 7) openTutorialMobileMenuIfNeeded();
    else if (index < 2 || index >= 8) closeTutorialMobileMenu();

    // Open the real window for steps that explain a window.
    if (index === 5) {
        setTimeout(() => toggleMainQRCode(), 80);
    } else if (index === 7) {
        setTimeout(() => openTranslateModal(), 80);
    }

    tutorialStepTimer = setTimeout(() => showTutorialStep(index), 220);
}
function getTutorialTarget(index) {
    const stepData = tutorialSteps[index];
    if (!stepData) return null;
    return document.querySelector(stepData.element);
}
function showTutorialStep(index) {
    if (index < 0 || index >= tutorialSteps.length) { endTutorial(); return; }
    clearTutorialHighlights();
    clearTutorialPanels();

    const stepData = tutorialSteps[index];
    const title = document.getElementById('tutorial-title');
    const text = document.getElementById('tutorial-text');
    const counter = document.getElementById('tutorial-step-counter');
    if (title) title.innerText = stepData.title;
    if (text) text.innerText = stepData.text;
    if (counter) counter.innerText = `${index + 1} / ${tutorialSteps.length}`;

    const prev = document.getElementById('tutorial-prev');
    const next = document.getElementById('tutorial-next');
    if (prev) prev.style.display = index === 0 ? 'none' : 'inline-flex';
    if (next) next.innerHTML = index === tutorialSteps.length - 1 ? 'إنهاء | Finish <i class="fa-solid fa-check"></i>' : 'التالي | Next <i class="fa-solid fa-arrow-right"></i>';

    const targetEl = getTutorialTarget(index);
    if (!targetEl) { positionTutorialCard(null); return; }

    // Do not scroll the page for controls inside the game modal; scrolling can move the
    // modal and make the highlight point at the wrong place. For normal page elements,
    // keep the existing behavior.
    if (!isTutorialGameStep(index)) {
        try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch(e) {}
    }

    // Measure twice: first after layout settles, then again on the next frame.
    // This is important for the game modal/header and for mobile menu animations.
    setTimeout(() => {
        requestAnimationFrame(() => {
            const rect = targetEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) { positionTutorialCard(null); return; }
            targetEl.classList.add('tutorial-highlight');
            positionTutorialPanels(rect);
            positionTutorialCard(rect);
        });
    }, isTutorialGameStep(index) ? 450 : 280);
}

function positionTutorialCard(rect) {
    const card = document.getElementById('tutorial-card');
    if (!card) return;
    const mobile = window.innerWidth <= 640;
    const margin = mobile ? 10 : 16;
    const cardWidth = Math.min(mobile ? window.innerWidth - 16 : 360, window.innerWidth - 16);
    card.style.width = `${cardWidth}px`;

    // Mobile: keep the explanation near the bottom so it does not cover header/modal controls.
    if (mobile) {
        const h = card.offsetHeight || 190;
        card.style.left = '8px';
        card.style.top = `${Math.max(8, window.innerHeight - h - 8)}px`;
        return;
    }

    const h = card.offsetHeight || 210;
    let left = Math.max(10, (window.innerWidth - cardWidth) / 2);
    let top = Math.max(10, (window.innerHeight - h) / 2);
    if (rect) {
        const below = window.innerHeight - rect.bottom;
        const above = rect.top;
        if (below >= h + margin) top = rect.bottom + margin;
        else if (above >= h + margin) top = rect.top - h - margin;
        left = Math.min(Math.max(10, rect.left), Math.max(10, window.innerWidth - cardWidth - 10));

        // Game controls are small and live in the modal header. Keep the tutorial card
        // away from that header so the arrow/highlight stays clearly on the button.
        if (isTutorialGameStep(currentTutorialIndex)) {
            const modal = document.getElementById('gameModal');
            const modalRect = modal?.getBoundingClientRect();
            if (modalRect) {
                const safeBelow = modalRect.bottom + margin;
                const safeAbove = modalRect.top - h - margin;
                if (safeBelow + h <= window.innerHeight - 8) top = safeBelow;
                else if (safeAbove >= 8) top = safeAbove;
                else top = Math.max(8, window.innerHeight - h - 8);
                left = Math.min(Math.max(8, modalRect.left), Math.max(8, window.innerWidth - cardWidth - 8));
            }
        }
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
}

function nextTutorialStep() {
    if (currentTutorialIndex >= tutorialSteps.length - 1) { endTutorial(); return; }
    currentTutorialIndex++;
    prepareTutorialStep(currentTutorialIndex);
}

function prevTutorialStep() {
    if (currentTutorialIndex <= 0) return;
    currentTutorialIndex--;
    prepareTutorialStep(currentTutorialIndex);
}

window.addEventListener('resize', () => {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay || overlay.style.display !== 'flex') return;
    clearTimeout(tutorialResizeTimer);
    tutorialResizeTimer = setTimeout(() => {
        const target = getTutorialTarget(currentTutorialIndex);
        if (target) {
            const rect = target.getBoundingClientRect();
            positionTutorialPanels(rect);
            positionTutorialCard(rect);
        }
    }, 120);
});

/* =================================================_
   Responsive Navigation Menu UI
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
const bars2 = document.querySelector("#house");
const xmark2 = document.querySelector("#xmark2");
const home_font = document.querySelector("#home_font");

// Normal Categories menu behavior (independent from the tutorial).
// Home opens the categories; X closes them. The tutorial never changes this behavior.
function openCategoriesMenu() {
    if (!home || !bars2 || !xmark2) return;
    // Open state: Home hidden, X visible.
    home.classList.add("active");
    bars2.classList.remove("active");
    xmark2.classList.add("active");
    home.style.opacity = "1";
    home.style.pointerEvents = "auto";
}

function closeCategoriesMenu() {
    if (!home || !bars2 || !xmark2) return;
    // Closed state: X hidden, Home visible.
    home.classList.remove("active");
    xmark2.classList.remove("active");
    bars2.classList.add("active");
    home.style.opacity = "";
    home.style.pointerEvents = "";
}

if (home_font) {
    home_font.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.closest("#xmark2")) {
            closeCategoriesMenu();
        } else if (e.target.closest("#house")) {
            openCategoriesMenu();
        }
    });
}

/* =================================================_
   Utilities & Event Listeners
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

window.onload = initPlatform;