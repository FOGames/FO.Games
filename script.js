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

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('تم تسجيل Service Worker بنجاح:', reg.scope))
        .catch(err => console.log('فشل تسجيل Service Worker:', err));
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
    if (btnInstall) {
        btnInstall.classList.add('installed');
    }
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
            if (outcome === 'accepted') {
                btnInstall.classList.add('installed');
            }
            pwaPrompt = null;
        }
    };
}

async function initPlatform() {
    try {
        setupPWAInstallButton();
        const res = await fetch('games.json?v=' + Date.now());
        if(!res.ok) throw new Error('games.json not found');
        const data = await res.json();
        const todaySeed = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const dailyIndex = parseInt(todaySeed) % (data.segments[0].hits.length || 1);

        rawGames = data.segments[0].hits.map((g,i)=>({
            ...g, playCount: parseInt(localStorage.getItem(`plays_${g.id}`)||0), isNew: i<5, isDaily: i === dailyIndex
        }));

        document.getElementById('loading-trigger').style.display = 'none';
        buildGenresBar(); applyFilters(); setupScrollButtons(); buildFeaturedSlider(); checkResumeBanner(); checkUrlHash();
        killGoogleBannerForever();
        const savedLang = localStorage.getItem('fo_lang');
        if(savedLang && savedLang!== 'ar') setTimeout(()=>selectLanguage(savedLang), 1500);

        window.addEventListener('scroll', handleScroll);
        window.addEventListener('hashchange', checkUrlHash);
    } catch (err) {
        console.error("فشل تحميل games.json", err);
        document.getElementById('loading-trigger').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> فشل تحميل الالعاب. اتأكد من ملف games.json';
    }
}

function killGoogleBannerForever() {
    bannerKiller = new MutationObserver(() => {
        document.querySelectorAll('.goog-te-banner-frame').forEach(f => f.remove());
        if(document.body.style.top!== '0px') document.body.style.top = '0px';
    });
    bannerKiller.observe(document.body, { childList: true, subtree: true });
}

function buildFeaturedSlider() {
    const container = document.getElementById('featured-slider-container');
    if (!container || rawGames.length === 0) return;
    const featured = rawGames.slice(0, 10);
    const fullList = [...featured,...featured,...featured];
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
    ['ar','en','fr','de','es','ru'].forEach(l=>{ let opt = document.createElement('option'); opt.value = l; opt.innerText = l; select.appendChild(opt); });
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

function sharePlatform() { const url = window.location.href; if (navigator.share) navigator.share({ title: 'FO.Games', text: 'العب أروع الألعاب المجانية على FO.Games!', url: url }); else navigator.clipboard.writeText(url).then(()=>alert('تم نسخ الرابط!')); }
function toggleMainQRCode() { const modal = document.getElementById('main-qr-modal'); modal.style.display = modal.style.display === 'flex'? 'none' : 'flex'; if (modal.style.display === 'flex') { document.getElementById('main-qrcode').innerHTML = ''; new QRCode(document.getElementById("main-qrcode"), { text: window.location.href, width: 160, height: 160 }); } }

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
function buildGenresBar() { const container = document.getElementById('genres-container'); const allGenres = new Set(); rawGames.forEach(g => g.genres && g.genres.forEach(genre => allGenres.add(genre))); let html = `<div class="genre-chip active" data-genre="all">الكل</div>`; allGenres.forEach(genre => { html += `<div class="genre-chip" data-genre="${genre}">${genre}</div>`; }); container.innerHTML = html; container.querySelectorAll('.genre-chip').forEach(c=>c.onclick=()=>filterByGenre(c.dataset.genre)); }
function filterByGenre(genre) { activeGenre = genre; document.querySelectorAll('.genre-chip').forEach(c => c.classList.toggle('active', c.dataset.genre===genre)); applyFilters(); }

document.querySelectorAll('.filter-tab').forEach(tab=>tab.onclick=()=>{ document.querySelectorAll('.filter-tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active'); activeFilter=tab.dataset.filter; applyFilters(); });
document.getElementById('search-input').addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase().trim(); applyFilters(); });

function applyFilters() {
    filteredGames = rawGames.filter(game => {
        const matchesGenre = activeGenre === 'all' || (game.genres && game.genres.includes(activeGenre));
        const matchesSearch = game.title.toLowerCase().includes(searchQuery) || (game.description && game.description.toLowerCase().includes(searchQuery));
        if(isKidsMode && game.genres && (game.genres.includes('action') || game.genres.includes('shooting') || game.genres.includes('horror'))) return false;
        let matchesFilter = true;
        if(activeFilter==='popular') matchesFilter = true; if(activeFilter==='new') matchesFilter = game.isNew; if(activeFilter==='played') matchesFilter = game.playCount>0; if(activeFilter==='favorites') matchesFilter = isFavorite(game.id); if(activeFilter==='desktop') matchesFilter = game.mobileReady?.includes("For Desktop"); if(activeFilter==='mobile') matchesFilter = game.mobileReady?.includes("For Android") || game.mobileReady?.includes("For IOS");
        return matchesGenre && matchesSearch && matchesFilter;
    });
    if(activeFilter==='popular') filteredGames.sort((a,b)=>b.playCount-a.playCount);
    displayedCount=0;
    document.getElementById('games-holder').innerHTML = '<div id="loading-trigger"><i class="fa-solid fa-circle-notch fa-spin"></i> <span>جاري استدعاء الألعاب...</span></div>';
    isLoading = false;
    renderBatch();
}

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

    if(filteredGames.length === 0){
        trigger.innerHTML = '<i class="fa-solid fa-face-frown"></i> <span>مفيش العاب بالمواصفات دي</span>';
        isLoading = false;
        return;
    }

    const nextBatch = filteredGames.slice(displayedCount, displayedCount + step);
    nextBatch.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `<div class="media-holder"><img class="game-img" src="${game.images[0]}" alt="${game.title}" loading="lazy"><div class="card-badges">${game.isDaily? `<span class="badge daily-badge"><i class="fa-solid fa-star"></i> تحدي اليوم</span>` : ''}<span class="badge"><i class="fa-solid ${game.screenOrientation?.horizontal?'fa-square-caret-right':'fa-mobile-screen-button'}"></i></span></div></div><div class="game-meta"><div class="game-title">${game.title}</div></div>`;
        card.onclick=()=>openGame(game);
        grid.insertBefore(card, trigger);
    });

    displayedCount+=step;

    if(displayedCount>=filteredGames.length) {
        trigger.innerHTML = '<i class="fa-solid fa-check"></i> <span>تم تحميل كل الألعاب</span>';
    }

    setTimeout(()=>{isLoading=false}, 300);
}

/* دالة فتح اللعبة مع ضبط الرابط وعرض الإطار بشكل صح */
function openGame(game, setHash = true) {
    currentGame=game; 
    game.playCount++; 
    localStorage.setItem(`plays_${game.id}`, game.playCount); 
    localStorage.setItem('last_played_game', game.id); 
    checkResumeBanner();

    if(setHash) {
        window.location.hash = `#game=${game.id}`;
    }

    document.getElementById('m-title').innerText=game.title; 
    
    const iframe = document.getElementById('gameIframe');
    iframe.src = game.gameURL; 

    document.getElementById('m-desc').innerText=game.description||'-'; 
    document.getElementById('m-howto').innerText=game.howToPlayText||'-'; 
    document.getElementById('m-orient').innerText=game.screenOrientation?.horizontal?'أفقي':'رأسي'; 
    document.getElementById('m-purchases').innerText=game.inGamePurchases==="Yes"?'نعم':'لا'; 
    document.getElementById('m-devices').innerText = game.mobileReady? game.mobileReady.join(', ') : 'جميع الأجهزة'; 
    
    updateFavModalBtn();

    const tagsBox=document.getElementById('m-tags'); 
    tagsBox.innerHTML=''; 
    if(game.tags) game.tags.forEach(t=>{
        const el=document.createElement('span');
        el.className='tag-item';
        el.innerText=t;
        tagsBox.appendChild(el);
    });

    document.getElementById('gameModal').style.display='flex'; 
    document.body.style.overflow='hidden'; 
    document.getElementById('qr-container').style.display = 'none';
}

/* دالة الخروج من صفحة اللعبة كلياً وتفريغ الـ Hash */
function closeGame(){ 
    if (window.location.hash.includes('#game=')) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    closeGameModalUI();
}

function closeGameModalUI() {
    const modal = document.getElementById('gameModal');
    if (modal) modal.style.display='none'; 
    const iframe = document.getElementById('gameIframe');
    if (iframe) iframe.src='about:blank'; 
    document.body.style.overflow='auto'; 
}

function updateFavModalBtn() {
    const btn = document.getElementById('btn-fav-modal');
    if (!btn ||!currentGame) return;
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

function playRandomGame() { if(rawGames.length === 0) return; const randomIndex = Math.floor(Math.random() * rawGames.length); openGame(rawGames[randomIndex]); }
function shareCurrentGame() { if(!currentGame) return; const url = window.location.href.split('#')[0] + `#game=${currentGame.id}`; if (navigator.share) navigator.share({ title: currentGame.title, text: `العب ${currentGame.title} على FO.Games!`, url: url }); else navigator.clipboard.writeText(url).then(()=>alert('تم نسخ الرابط!')); }
function toggleGameQRCode() { const container = document.getElementById('qr-container'); if(container.style.display === 'block') container.style.display = 'none'; else { container.style.display = 'block'; document.getElementById('qrcode').innerHTML = ''; const url = window.location.href.split('#')[0] + `#game=${currentGame.id}`; new QRCode(document.getElementById("qrcode"), { text: url, width: 128, height: 128 }); } }
function toggleTheme() { document.body.classList.toggle('light-theme'); const icon = document.getElementById('theme-icon'); if(document.body.classList.contains('light-theme')) icon.className = 'fa-solid fa-sun'; else icon.className = 'fa-solid fa-moon'; }
function toggleKidsMode() { isKidsMode =!isKidsMode; document.getElementById('kids-label').innerText = isKidsMode? "الأطفال: مفعل" : "الأطفال: إيقاف"; applyFilters(); }

function openFooterInfo(type) {
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('info-modal-title');
    const text = document.getElementById('info-modal-text');
    if(type === 'about') { title.innerText = "عن FO.Games"; text.innerText = "FO.Games هي منصتك الأولى للألعاب المجانية بدون أي تحميل."; }
    else if(type === 'contact') { title.innerText = "تواصل معنا"; text.innerText = "لأي استفسار تواصل معنا."; }
    else if(type === 'privacy') { title.innerText = "سياسة الخصوصية"; text.innerText = "نحن نحترم خصوصيتك."; }
    modal.style.display = 'flex';
}

document.getElementById('btn-fullscreen').onclick=()=>{ const el=document.getElementById('iframe-container'); if(!document.fullscreenElement) el.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); };
function setupScrollButtons(){ const bar = document.getElementById('genres-container'); document.getElementById('scrollLeft').onclick = () => bar.scrollBy({left: 300, behavior:'smooth'}); document.getElementById('scrollRight').onclick = () => bar.scrollBy({left: -300, behavior:'smooth'}); }
function isFavorite(id){ return JSON.parse(localStorage.getItem('favorites')||'[]').includes(id); }
function toggleFav(id){ let favs=JSON.parse(localStorage.getItem('favorites')||'[]'); if(favs.includes(id)){ favs=favs.filter(f=>f!==id); } else{ favs.push(id); } localStorage.setItem('favorites',JSON.stringify(favs)); }

window.onload = initPlatform;