// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
  
  // Tab switching
  setupTabs();
  
  // Yakalanan token'ları yükle
  loadCapturedTokens();
  
  // Decode butonu
  document.getElementById('decode-btn').addEventListener('click', decodeJWT);
  
  // Clear all butonu
  document.getElementById('clear-all').addEventListener('click', clearAllTokens);
  
  // Copy butonları
  setupCopyButtons();
});

// Tab sistemi
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Aktif tab'ı kaldır
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      // Yeni tab'ı aktif et
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

// Yakalanan token'ları yükle
async function loadCapturedTokens() {
  const response = await chrome.runtime.sendMessage({ action: 'getTokens' });
  const tokens = response.tokens || [];
  
  displayCapturedTokens(tokens);
}

// Token listesini göster
function displayCapturedTokens(tokens) {
  const tokenList = document.getElementById('token-list');
  const clearBtn = document.getElementById('clear-all');
  const tokenCount = document.getElementById('token-count');
  
  // Sayıyı güncelle
  tokenCount.textContent = `${tokens.length} token yakalandı`;
  
  if (tokens.length === 0) {
    tokenList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>Henüz JWT yakalanmadı</p>
        <p style="font-size: 12px;">Web sitelerinde gezinin, otomatik olarak JWT'ler yakalanacak</p>
      </div>
    `;
    clearBtn.style.display = 'none';
    return;
  }
  
  clearBtn.style.display = 'block';
  
  // Token'ları listele
  tokenList.innerHTML = tokens.map((tokenData, index) => {
    const timeAgo = getTimeAgo(tokenData.timestamp);
    const preview = tokenData.token.substring(0, 50) + '...';
    
    return `
      <div class="token-item" data-index="${index}">
        <div class="token-time">${timeAgo}</div>
        <div class="token-source">${escapeHtml(tokenData.source)}</div>
        <div class="token-url">${escapeHtml(tokenData.url)}</div>
        <div class="token-preview">${escapeHtml(preview)}</div>
        <button class="delete-btn" data-index="${index}">Sil</button>
      </div>
    `;
  }).join('');
  
  // Token'a tıklayınca analiz et
  document.querySelectorAll('.token-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Delete butonuna tıklanmışsa ignore et
      if (e.target.classList.contains('delete-btn')) return;
      
      const index = parseInt(item.getAttribute('data-index'));
      const token = tokens[index].token;
      analyzeToken(token);
    });
  });
  
  // Delete butonları
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.getAttribute('data-index'));
      const token = tokens[index].token;
      
      await chrome.runtime.sendMessage({ 
        action: 'deleteToken',
        token: token
      });
      
      loadCapturedTokens();
    });
  });
}

// Token'ı analiz et ve Analyze tab'a geç
function analyzeToken(token) {
  // Analyze tab'a geç
  document.querySelector('.tab[data-tab="analyze"]').click();
  
  // Token'ı textarea'ya yapıştır
  document.getElementById('jwt-input').value = token;
  
  // Otomatik decode et
  decodeJWT();
}

// Tüm token'ları temizle
async function clearAllTokens() {
  if (!confirm('Tüm yakalanan token\'lar silinecek. Emin misiniz?')) {
    return;
  }
  
  await chrome.runtime.sendMessage({ action: 'clearTokens' });
  loadCapturedTokens();
}

// Zaman farkını hesapla
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Az önce';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dakika önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} saat önce`;
  return `${Math.floor(seconds / 86400)} gün önce`;
}

// HTML escape (XSS önleme)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// JWT Decode
function decodeJWT() {
  const jwtInput = document.getElementById('jwt-input').value.trim();
  
  if (!jwtInput) {
    alert('Lütfen bir JWT token girin!');
    return;
  }
  
  try {
    const decoded = parseJWT(jwtInput);
    displayResults(decoded);
    analyzeSecurityAndDisplay(decoded);
  } catch (error) {
    alert('Hata: ' + error.message);
  }
}

function parseJWT(token) {
  const parts = token.split('.');
  
  if (parts.length !== 3) {
    throw new Error('Geçersiz JWT formatı! JWT 3 parçadan oluşmalı.');
  }
  
  const header = parts[0];
  const payload = parts[1];
  const signature = parts[2];
  
  function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      if (pad === 1) {
        throw new Error('Geçersiz Base64 string');
      }
      base64 += '='.repeat(4 - pad);
    }
    return atob(base64);
  }
  
  const headerDecoded = JSON.parse(base64UrlDecode(header));
  const payloadDecoded = JSON.parse(base64UrlDecode(payload));
  
  return {
    header: headerDecoded,
    payload: payloadDecoded,
    signature: signature,
    raw: token
  };
}

function displayResults(decoded) {
  document.getElementById('header-output').textContent = 
    JSON.stringify(decoded.header, null, 2);
  
  document.getElementById('payload-output').textContent = 
    JSON.stringify(decoded.payload, null, 2);
  
  document.getElementById('signature-output').textContent = 
    decoded.signature;
  
  document.getElementById('result').style.display = 'block';
}

function analyzeSecurityAndDisplay(decoded) {
  const analysis = SecurityChecker.analyze(decoded.header, decoded.payload);
  
  displaySecurityScore(analysis.score);
  displaySecurityIssues(analysis);
}

function displaySecurityScore(score) {
  const scoreElement = document.getElementById('score-value');
  const scoreText = document.getElementById('score-text');
  const scoreCircle = document.getElementById('score-circle');
  
  scoreElement.textContent = score;
  
  if (score >= 80) {
    scoreCircle.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    scoreText.textContent = 'Güvenli';
    scoreText.style.color = '#4CAF50';
  } else if (score >= 50) {
    scoreCircle.style.background = 'linear-gradient(135deg, #FF9800, #F57C00)';
    scoreText.textContent = 'Orta Risk';
    scoreText.style.color = '#FF9800';
  } else {
    scoreCircle.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
    scoreText.textContent = 'Tehlikeli';
    scoreText.style.color = '#f44336';
  }
  
  document.getElementById('security-analysis').style.display = 'block';
}

function displaySecurityIssues(analysis) {
  const container = document.getElementById('issues-container');
  container.innerHTML = '';
  
  if (analysis.issues.length > 0) {
    const issuesSection = createIssueSection('🔴 Kritik Sorunlar', analysis.issues, 'critical');
    container.appendChild(issuesSection);
  }
  
  if (analysis.warnings.length > 0) {
    const warningsSection = createIssueSection('🟠 Uyarılar', analysis.warnings, 'warning');
    container.appendChild(warningsSection);
  }
  
  if (analysis.info.length > 0) {
    const infoSection = createIssueSection('🔵 Bilgilendirme', analysis.info, 'info');
    container.appendChild(infoSection);
  }
  
  if (analysis.issues.length === 0 && analysis.warnings.length === 0) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = '✅ Güvenlik kontrollerinde sorun bulunamadı!';
    container.appendChild(successDiv);
  }
}

function createIssueSection(title, items, type) {
  const section = document.createElement('div');
  section.className = 'issue-section';
  
  const header = document.createElement('h3');
  header.textContent = title;
  header.className = `issue-header ${type}`;
  section.appendChild(header);
  
  items.forEach(item => {
    const issueDiv = document.createElement('div');
    issueDiv.className = `issue-item ${type}`;
    
    let html = `
      <div class="issue-title">${item.title}</div>
      <div class="issue-description">${item.description}</div>
    `;
    
    if (item.detail) {
      html += `<div class="issue-detail">${item.detail}</div>`;
    }
    
    if (item.fix) {
      html += `<div class="issue-fix">💡 Çözüm: ${item.fix}</div>`;
    }
    
    if (item.note) {
      html += `<div class="issue-note">ℹ️ Not: ${item.note}</div>`;
    }
    
    issueDiv.innerHTML = html;
    section.appendChild(issueDiv);
  });
  
  return section;
}

// Copy to clipboard
function setupCopyButtons() {
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('copy-btn')) {
      const type = e.target.getAttribute('data-copy');
      let text = '';
      
      if (type === 'header') {
        text = document.getElementById('header-output').textContent;
      } else if (type === 'payload') {
        text = document.getElementById('payload-output').textContent;
      } else if (type === 'signature') {
        text = document.getElementById('signature-output').textContent;
      }
      
      navigator.clipboard.writeText(text).then(() => {
        const originalText = e.target.textContent;
        e.target.textContent = 'Kopyalandı!';
        setTimeout(() => {
          e.target.textContent = originalText;
        }, 2000);
      });
    }
  });
}