let rawGames = [];
let filteredGames = [];
let displayedCount = 0;
const step = 60;
let activeGenre = 'all';
let searchQuery = '';
let activeFilter = 'all';
let currentGame = null;
let isKidsMode = false;
let deferredPrompt = null;

async function initPlatform() {
    try {
        const res = await fetch('games.json');
        const data = await res.json();
        
        let hits = [];
        if (data && data.segments && data.segments[0] && data.segments[0].hits) {
            hits = data.segments[0].hits;
        } else if (Array.isArray(data)) {
            hits = data;
        }

        rawGames = hits.map((g, i) => ({
            ...g,
            playCount: parseInt(localStorage.getItem(`plays_${g.id}`) || 0),
            isNew: i < 10
        }));

        buildGenresBar();
        applyFilters();
        setupScrollButtons();
        buildFeaturedTicker();
        checkResumeBanner();
        loadTheme();
        initGoogleTranslate();
        setupFullscreen();
        setupPWAInstall();
        checkUrlParams();
    } catch (err) {
        console.error("فشل تحميل الألعاب:", err);
    }
}

/* 🌍 تشغيل مترجم جوجل المضمون للـ 10 لغات */
function initGoogleTranslate() {
    window.googleTranslateElementInit = function() {
        new google.translate.TranslateElement({
            pageLanguage: 'ar',
            includedLanguages: 'ar,en,fr,es,de,it,ru,zh-CN,ja,pt',
            autoDisplay: false
        }, 'google_translate_element');
    };

    const gtScript = document.createElement('script');
    gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    gtScript.async = true;
    document.body.appendChild(gtScript);

    new MutationObserver(() => {
        document.querySelectorAll('.VIpgJd-ZVi9od-ORHb-OEVmcd, .goog-te-banner-frame').forEach(f => f.remove());
        document.body.style.top = '0px';
    }).observe(document.body, { childList: true, subtree: true });
}

/* 🔄 دالة الترجمة عند اختيار لغة من القائمة */
function changeLanguage(langCode) {
    let attempts = 0;
    const interval = setInterval(() => {
        const select = document.querySelector('.goog-te-combo');
        if (select) {
            select.value = langCode;
            select.dispatchEvent(new Event('change'));
            clearInterval(interval);
        }
        attempts++;
        if (attempts > 15) clearInterval(interval);
    }, 200);
}

/* 📺 بناء شريط الأخبار للألعاب المميزة */
function buildFeaturedTicker() {
    const container = document.getElementById('featured-slider-container');
    if (!container || rawGames.length === 0) return;
    const featured = rawGames.slice(0, 10);
    
    const cardsHtml = featured.map(g => `
        <div class="slide-card" onclick="openGameById('${g.id}')">
            <img src="${g.images && g.images[0] ? g.images[0] : ''}" loading="lazy" alt="${g.title}">
        </div>
    `).join('');

    container.innerHTML = cardsHtml + cardsHtml;
}

/* 📱 زر تثبيت التطبيق PWA */
function setupPWAInstall() {
    const installBtn = document.getElementById('install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.style.display = 'flex';
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                }
                deferredPrompt = null;
            } else {
                alert('التطبيق مثبت بالفعل أو أن متصفحك لا يدعم التثبيت المباشر.');
            }
        });
    }
}

function checkResumeBanner() {
    const lastId = localStorage.getItem('last_played_game');
    if (lastId) {
        const game = rawGames.find(g => g.id === lastId);
        if (game) {
            document.getElementById('resume-title').innerText = game.title;
            document.getElementById('resume-banner').style.display = 'flex';
        }
    }
}

function resumeLastGame() {
    const lastId = localStorage.getItem('last_played_game');
    if (lastId) openGameById(lastId);
}

function buildGenresBar() {
    const container = document.getElementById('genres-container');
    if (!container) return;
    const allGenres = new Set();
    rawGames.forEach(g => g.genres && g.genres.forEach(genre => allGenres.add(genre)));
    
    let html = `<div class="genre-chip active" data-genre="all">الكل</div>`;
    allGenres.forEach(genre => {
        html += `<div class="genre-chip" data-genre="${genre}">${genre}</div>`;
    });
    
    container.innerHTML = html;
    container.querySelectorAll('.genre-chip').forEach(c => c.onclick = () => filterByGenre(c.dataset.genre));
}

function filterByGenre(genre) {
    activeGenre = genre;
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.toggle('active', c.dataset.genre === genre));
    applyFilters();
}

document.querySelectorAll('.filter-tab:not(.random-btn)').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.filter-tab:not(.random-btn)').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeFilter = tab.dataset.filter;
        applyFilters();
    };
});

document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilters();
});

function applyFilters() {
    filteredGames = rawGames.filter(game => {
        const matchesGenre = activeGenre === 'all' || (game.genres && game.genres.includes(activeGenre));
        const matchesSearch = game.title.toLowerCase().includes(searchQuery);
        if (isKidsMode && game.genres && (game.genres.includes('action') || game.genres.includes('shooting'))) return false;
        
        let matchesFilter = true;
        if (activeFilter === 'new') matchesFilter = game.isNew;
        if (activeFilter === 'played') matchesFilter = game.playCount > 0;
        if (activeFilter === 'favorites') matchesFilter = isFavorite(game.id);
        if (activeFilter === 'desktop') matchesFilter = game.mobileReady?.includes("For Desktop");
        if (activeFilter === 'mobile') matchesFilter = game.mobileReady?.includes("For Android");
        
        return matchesGenre && matchesSearch && matchesFilter;
    });

    if (activeFilter === 'popular') filteredGames.sort((a, b) => b.playCount - a.playCount);
    
    displayedCount = 0;
    const holder = document.getElementById('games-holder');
    holder.innerHTML = '<div id="loading-trigger"><i class="fa-solid fa-circle-notch fa-spin"></i><span> جاري استدعاء الألعاب...</span></div>';
    renderBatch();
}

function renderBatch() {
    const trigger = document.getElementById('loading-trigger');
    if (!trigger) return;
    const nextBatch = filteredGames.slice(displayedCount, displayedCount + step);
    let html = '';
    nextBatch.forEach(game => {
        const imgSrc = game.images && game.images[0] ? game.images[0] : '';
        html += `
        <div class="game-card" onclick="openGameById('${game.id}')">
            <div class="media-holder">
                <img class="game-img" src="${imgSrc}" alt="${game.title}" loading="lazy">
                <div class="card-info-overlay">
                    <div class="game-title-overlay">${game.title}</div>
                    <div class="game-genres-overlay">${game.genres ? game.genres.join(', ') : ''}</div>
                </div>
            </div>
        </div>`;
    });
    trigger.insertAdjacentHTML('beforebegin', html);
    displayedCount += step;
    if (displayedCount >= filteredGames.length) trigger.style.display = 'none';
}

window.addEventListener('scroll', () => {
    const trigger = document.getElementById('loading-trigger');
    if (!trigger || trigger.style.display === 'none') return;
    const rect = trigger.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 1000 && displayedCount < filteredGames.length) {
        renderBatch();
    }
});

function openGame(game) {
    currentGame = game;
    game.playCount++;
    localStorage.setItem(`plays_${game.id}`, game.playCount);
    localStorage.setItem('last_played_game', game.id);
    checkResumeBanner();

    document.getElementById('m-title').innerText = game.title;
    document.getElementById('gameIframe').src = game.gameURL;
    document.getElementById('m-desc').innerText = game.description || 'لا يوجد وصف متاح.';
    document.getElementById('m-howto').innerText = game.instructions || 'استخدم اللمس أو لوحة المفاتيح والماوس للعب.';
    document.getElementById('m-orient').innerText = game.orientation || 'تلقائي';
    document.getElementById('m-purchases').innerText = game.hasInAppPurchases ? 'نعم' : 'لا';
    document.getElementById('m-devices').innerText = game.mobileReady ? game.mobileReady.join(', ') : 'جميع الأجهزة';

    updateModalFavIcon();
    document.getElementById('qr-container').style.display = 'none';
    document.getElementById('gameModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeGame() {
    document.getElementById('gameModal').style.display = 'none';
    document.getElementById('gameIframe').src = '';
    document.body.style.overflow = 'auto';
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
    }
}

function playRandomGame() {
    if (!rawGames || rawGames.length === 0) return;
    const randomIndex = Math.floor(Math.random() * rawGames.length);
    openGame(rawGames[randomIndex]);
}

function toggleTheme() {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = 'fa-solid fa-sun';
    }
}

function toggleKidsMode() {
    isKidsMode = !isKidsMode;
    const label = document.getElementById('kids-label');
    if (label) label.innerText = `الأطفال: ${isKidsMode ? 'تشغيل' : 'إيقاف'}`;
    applyFilters();
}

function isFavorite(id) {
    return JSON.parse(localStorage.getItem('favorites') || '[]').includes(id);
}

function toggleFavCurrent() {
    if (!currentGame) return;
    let favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    if (favs.includes(currentGame.id)) {
        favs = favs.filter(f => f !== currentGame.id);
    } else {
        favs.push(currentGame.id);
    }
    localStorage.setItem('favorites', JSON.stringify(favs));
    updateModalFavIcon();
    if (activeFilter === 'favorites') applyFilters();
}

function updateModalFavIcon() {
    const btn = document.getElementById('btn-fav-modal');
    if (!btn || !currentGame) return;
    const active = isFavorite(currentGame.id);
    btn.style.color = active ? '#e53e3e' : 'var(--text)';
}

function openGameById(id) {
    const g = rawGames.find(x => x.id === id);
    if (g) openGame(g);
}

function setupScrollButtons() {
    const container = document.getElementById('genres-container');
    const btnRight = document.getElementById('scrollRight');
    const btnLeft = document.getElementById('scrollLeft');
    if (!container || !btnRight || !btnLeft) return;

    btnRight.onclick = () => container.scrollBy({ left: 200, behavior: 'smooth' });
    btnLeft.onclick = () => container.scrollBy({ left: -200, behavior: 'smooth' });
}

function setupFullscreen() {
    const fsBtn = document.getElementById('btn-fullscreen');
    if (!fsBtn) return;
    fsBtn.onclick = () => {
        const container = document.getElementById('iframe-container');
        if (!container) return;
        
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (container.requestFullscreen) container.requestFullscreen();
            else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    };
}

function sharePlatform() {
    if (navigator.share) {
        navigator.share({ title: 'FO.Games', url: window.location.href });
    } else {
        navigator.clipboard.writeText(window.location.href);
        alert('تم نسخ رابط المنصة إلى الحافظة!');
    }
}

function shareCurrentGame() {
    if (!currentGame) return;
    const url = `${window.location.origin}${window.location.pathname}?game=${currentGame.id}`;
    if (navigator.share) {
        navigator.share({ title: currentGame.title, url: url });
    } else {
        navigator.clipboard.writeText(url);
        alert('تم نسخ رابط اللعبة!');
    }
}

function toggleGameQRCode() {
    const qrCont = document.getElementById('qr-container');
    if (!qrCont || !currentGame) return;
    if (qrCont.style.display === 'none' || qrCont.style.display === '') {
        qrCont.style.display = 'block';
        const qrcodeBox = document.getElementById('qrcode');
        qrcodeBox.innerHTML = '';
        new QRCode(qrcodeBox, {
            text: `${window.location.origin}${window.location.pathname}?game=${currentGame.id}`,
            width: 128,
            height: 128
        });
    } else {
        qrCont.style.display = 'none';
    }
}

function toggleMainQRCode() {
    const modal = document.getElementById('main-qr-modal');
    if (!modal) return;
    if (modal.style.display === 'none' || modal.style.display === '') {
        modal.style.display = 'flex';
        const box = document.getElementById('main-qrcode');
        box.innerHTML = '';
        new QRCode(box, {
            text: window.location.href,
            width: 160,
            height: 160
        });
    } else {
        modal.style.display = 'none';
    }
}

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (gameId) openGameById(gameId);
}

window.onload = initPlatform;