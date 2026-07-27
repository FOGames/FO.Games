// 1. أسامي ملفات الـ JSON الأربعة اللي عندك (غير الأسامي هنا لتطابق ملفاتك بالظبط)
const jsonFiles = ['Android.JSON', 'DICKTOP.JSON', 'IOS.JSON', 'AllGames.JSON'];

let currentFileIndex = 0; // لتبديل الملفات الأربعة
let gamesData = [];       // مخزن الألعاب المحملة من الملف الحالي
let currentIndex = 0;     // مؤشر الألعاب داخل الملف الحالي
const batchSize = 6;      // عدد الألعاب التي تظهر في كل "قلبة" (مثل الفيسبوك)
let isLoading = false;

const feedContainer = document.getElementById('games-container');
const spinner = document.getElementById('loading-spinner');

// دالة جلب البيانات من ملف الـ JSON التالي عند الحاجة
// دالة جلب البيانات من ملف الـ JSON التالي عند الحاجة (المعدلة الذكية)
async function loadNextJsonFile() {
    if (currentFileIndex >= jsonFiles.length) {
        spinner.style.display = 'none'; // انتهت كل الألعاب
        return false;
    }

    try {
        const response = await fetch(jsonFiles[currentFileIndex]);
        if (!response.ok) throw new Error('فشل تحميل الملف');
        
        const rawData = await response.json();
        
        // فحص تلقائي لتحويل أي شكل JSON لمصفوفة ألعاب فوراً
        if (Array.isArray(rawData)) {
            gamesData = rawData;
        } else if (rawData && typeof rawData === 'object') {
            if (Array.isArray(rawData.games)) gamesData = rawData.games;
            else if (Array.isArray(rawData.data)) gamesData = rawData.data;
            else if (Array.isArray(rawData.results)) gamesData = rawData.results;
            else {
                // لو الألعاب متخزنة كـ أوبجكت (مفاتيح وأقواس {})، السطر ده هيحولها لمصفوفة
                gamesData = Object.values(rawData);
            }
        } else {
            gamesData = [];
        }

        currentIndex = 0; // إعادة التصفير للملف الجديد
        currentFileIndex++; // التجهيز للملف اللي بعده المرة الجاية
        return true;
    } catch (error) {
        console.error("خطأ في قراءة ملف الـ JSON:", error);
        return false;
    }
}

// الدالة الرئيسية لعرض الألعاب بالتدريج
async function loadNextGames() {
    if (isLoading) return;
    isLoading = true;
    spinner.style.display = 'block';

    // لو الألعاب المتاحة في الملف الحالي خلصت، انقل على ملف الـ JSON اللي بعده
    if (currentIndex >= gamesData.length) {
        const hasMoreData = await loadNextJsonFile();
        if (!hasMoreData || gamesData.length === 0) {
            isLoading = false;
            spinner.style.display = 'none';
            return;
        }
    }

    // عرض الدفعة الجديدة من الألعاب
    const nextBatch = gamesData.slice(currentIndex, currentIndex + batchSize);
    nextBatch.forEach(game => {
        // التأكد من وجود البيانات الأساسية حتى لا يحدث خطأ في الكود
        const gameTitle = game.title || "لعبة مميزة";
        const gameIcon = game.icon || "https://via.placeholder.com/60";
        const gameThumb = game.thumb || game.preview || "https://via.placeholder.com/400x250";
        const gameDesc = game.desc || "اضغط للعب والاستمتاع فوراً بدون تحميل.";
        const gameSlug = game.slug || game.id;
        const gameUrl = game.url;

        const card = document.createElement('div');
        card.className = 'game-card';
        
        // جلب التصنيفات لو موجودة
        const genresArray = Array.isArray(game.genres) ? game.genres : [];
        const genreTags = genresArray.map(g => `<span class="genre-tag">#${g}</span>`).join('');

        card.innerHTML = `
            <div class="card-header">
                <img class="game-icon" src="${gameIcon}" alt="${gameTitle}" loading="lazy">
                <div class="game-meta">
                    <h3>${gameTitle}</h3>
                    <div class="game-genres">${genreTags}</div>
                </div>
            </div>
            <img class="game-thumbnail" src="${gameThumb}" alt="${gameTitle} Preview" loading="lazy">
            <div class="card-body">
                <p>${gameDesc}</p>
                <button class="btn-play" onclick="openGamePage('${gameSlug}')">تشغيل اللعبة الآن</button>
            </div>
        `;
        feedContainer.appendChild(card);
    });

    currentIndex += batchSize;
    isLoading = false;
    
    // لو لسه الشاشة مش مليانة ألعاب والمستخدم منزلتش، حمل دفعة كمان تلقائي
    if (window.innerHeight >= document.documentElement.scrollHeight) {
        loadNextGames();
    }
}

// دالة لتسهيل التنقل لصفحة اللعبة
function openGamePage(slug) {
    window.location.hash = `#/game/${slug}`;
}

// مراقبة النزول لأسفل الصفحة (Infinite Scroll) لطلب ألعاب جديدة
window.addEventListener('scroll', () => {
    if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 300) {
        loadNextGames();
    }
});

// نظام الـ Routing لفتح اللعبة جوه الـ iframe
function handleRouting() {
    const hash = window.location.hash;
    const feedView = document.getElementById('feed-view');
    const gameView = document.getElementById('game-view');
    const iframeWrapper = document.getElementById('iframe-wrapper');

    if (hash.startsWith('#/game/')) {
        const slug = hash.replace('#/game/', '');
        // البحث عن اللعبة داخل الدفعة الحالية المحملة في الذاكرة
        const game = gamesData.find(g => (g.slug === slug || g.id == slug));

        if (game) {
            document.getElementById('game-view-title').innerText = game.title || "لعبة";
            document.getElementById('game-view-desc').innerText = game.desc || "";
            document.getElementById('game-view-howto').innerText = game.howto || "استخدم عناصر التحكم على الشاشة للعب.";

            // تحميل الـ iframe بالطلب لتوفير باقة النت تماماً!
            iframeWrapper.innerHTML = `<iframe src="${game.url}" allow="fullscreen; web-share; autoplay"></iframe>`;

            document.getElementById('btn-fullscreen').onclick = () => {
                const iframe = iframeWrapper.querySelector('iframe');
                if(iframe.requestFullscreen) iframe.requestFullscreen();
                else if(iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
            };

            document.getElementById('btn-share').onclick = async () => {
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: game.title,
                            text: game.desc,
                            url: window.location.href
                        });
                    } catch (err) { console.log(err); }
                } else {
                    navigator.clipboard.writeText(window.location.href);
                    alert('تم نسخ رابط اللعبة بنجاح!');
                }
            };

            feedView.classList.remove('active');
            gameView.classList.add('active');
            window.scrollTo(0,0);
        }
    } else {
        iframeWrapper.innerHTML = '';
        gameView.classList.remove('active');
        feedView.classList.add('active');
    }
}

window.addEventListener('hashchange', handleRouting);
window.addEventListener('DOMContentLoaded', async () => {
    // تحميل أول ملف JSON عند فتح الموقع مباشرة
    await loadNextGames();
    handleRouting();
});

// أكواد التثبيت الـ PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btn-install').style.display = 'block';
});

document.getElementById('btn-install').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('btn-install').style.display = 'none';
        }
        deferredPrompt = null;
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}