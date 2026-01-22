// ===== SERVICE WORKER BAŞLANGIÇ =====
console.log('🚀 JWT Decoder Pro başlatıldı');

// Global değişkenler
let capturedTokens = [];

// Storage'dan token'ları yükle
loadTokensFromStorage();

// ===== EVENT LISTENER'LARI HEMEN KAYDET =====

// Network isteklerini dinle - HEMEN kaydet, async yok!
chrome.webRequest.onBeforeSendHeaders.addListener(
    handleBeforeSendHeaders,
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
);

chrome.webRequest.onHeadersReceived.addListener(
    handleHeadersReceived,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

// Runtime mesajlarını dinle
chrome.runtime.onMessage.addListener(handleMessage);

// Install/Activate events
chrome.runtime.onInstalled.addListener(() => {
    console.log('📦 Extension yüklendi');
    loadTokensFromStorage();
});

// ===== FONKSIYONLAR =====

async function loadTokensFromStorage() {
    try {
        const data = await chrome.storage.local.get(['tokens']);
        if (data.tokens) {
            capturedTokens = data.tokens;
            console.log(`📂 ${capturedTokens.length} token storage'dan yüklendi`);
        }
        updateBadge();
    } catch (error) {
        console.error('Storage yükleme hatası:', error);
    }
}

function handleBeforeSendHeaders(details) {
    console.log('🌐 İstek yakalandı:', details.url);

    if (!details.requestHeaders) return;

    // Authorization header
    const authHeader = details.requestHeaders.find(
        header => header.name.toLowerCase() === 'authorization'
    );

    if (authHeader && authHeader.value) {
        console.log('🔑 Authorization header bulundu');

        if (authHeader.value.startsWith('Bearer ')) {
            const token = authHeader.value.substring(7);
            if (isValidJWT(token)) {
                console.log('✅ JWT tespit edildi!');
                captureToken(token, 'Authorization Header', details.url);
            }
        } else if (isValidJWT(authHeader.value)) {
            console.log('✅ JWT tespit edildi (Bearer olmadan)!');
            captureToken(authHeader.value, 'Authorization Header', details.url);
        }
    }

    // Cookie
    const cookieHeader = details.requestHeaders.find(
        header => header.name.toLowerCase() === 'cookie'
    );

    if (cookieHeader && cookieHeader.value) {
        extractJWTFromCookies(cookieHeader.value, details.url);
    }
}

function handleHeadersReceived(details) {
    if (!details.responseHeaders) return;

    const setCookieHeaders = details.responseHeaders.filter(
        header => header.name.toLowerCase() === 'set-cookie'
    );

    setCookieHeaders.forEach(header => {
        if (header.value) {
            extractJWTFromCookies(header.value, details.url);
        }
    });
}

function handleMessage(request, sender, sendResponse) {
    console.log('💬 Mesaj alındı:', request.action);

    if (request.action === 'getTokens') {
        sendResponse({ tokens: capturedTokens });
        return true;
    }

    if (request.action === 'clearTokens') {
        capturedTokens = [];
        chrome.storage.local.set({ tokens: [] });
        updateBadge();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'deleteToken') {
        capturedTokens = capturedTokens.filter(t => t.token !== request.token);
        chrome.storage.local.set({ tokens: capturedTokens });
        updateBadge();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'storageTokensFound') {
        request.tokens.forEach(tokenData => {
            captureToken(tokenData.token, tokenData.source, tokenData.url);
        });
        sendResponse({ success: true });
        return true;
    }

    return true;
}

function isValidJWT(token) {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    try {
        atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        return true;
    } catch {
        return false;
    }
}

function extractJWTFromCookies(cookieString, url) {
    const cookies = cookieString.split(';');

    cookies.forEach(cookie => {
        const parts = cookie.trim().split('=');
        if (parts.length >= 2) {
            const name = parts[0];
            const value = parts.slice(1).join('=');

            if (value && isValidJWT(value)) {
                captureToken(value, `Cookie: ${name}`, url);
            }
        }
    });
}

function captureToken(token, source, url) {
    const exists = capturedTokens.some(t => t.token === token);
    if (exists) {
        console.log('⏭️ Token zaten var, atlandı');
        return;
    }

    let decoded;
    try {
        decoded = parseJWT(token);
    } catch (error) {
        console.log('❌ Parse hatası:', error);
        return;
    }

    const tokenData = {
        token: token,
        source: source,
        url: url,
        timestamp: Date.now(),
        header: decoded.header,
        payload: decoded.payload
    };

    capturedTokens.unshift(tokenData);

    if (capturedTokens.length > 50) {
        capturedTokens = capturedTokens.slice(0, 50);
    }

    chrome.storage.local.set({ tokens: capturedTokens });
    updateBadge();

    console.log('🎉 JWT yakalandı:', source, url);
}

function parseJWT(token) {
    const parts = token.split('.');

    function base64UrlDecode(str) {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) {
            if (pad === 1) throw new Error('Invalid base64');
            base64 += '='.repeat(4 - pad);
        }
        return atob(base64);
    }

    return {
        header: JSON.parse(base64UrlDecode(parts[0])),
        payload: JSON.parse(base64UrlDecode(parts[1])),
        signature: parts[2]
    };
}

function updateBadge() {
    const count = capturedTokens.length;

    if (count > 0) {
        chrome.action.setBadgeText({ text: count.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        console.log('🔔 Badge güncellendi:', count);
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

console.log('✅ Tüm event listener\'lar kaydedildi');
