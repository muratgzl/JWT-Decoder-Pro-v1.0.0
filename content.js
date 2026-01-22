// Sayfa yüklendiğinde localStorage ve sessionStorage'ı tara
(function() {
  
  function scanStorage() {
    const found = [];
    
    // localStorage'ı tara
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      if (isValidJWT(value)) {
        found.push({
          token: value,
          source: `localStorage: ${key}`,
          url: window.location.href
        });
      }
    }
    
    // sessionStorage'ı tara
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      
      if (isValidJWT(value)) {
        found.push({
          token: value,
          source: `sessionStorage: ${key}`,
          url: window.location.href
        });
      }
    }
    
    // Bulunanları background'a gönder
    if (found.length > 0) {
      chrome.runtime.sendMessage({
        action: 'storageTokensFound',
        tokens: found
      });
    }
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
  
  // Sayfa yüklendiğinde tara
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanStorage);
  } else {
    scanStorage();
  }
  
  // Storage değişikliklerini izle
  window.addEventListener('storage', () => {
    scanStorage();
  });
  
})();