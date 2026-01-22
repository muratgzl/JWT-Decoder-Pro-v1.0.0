// Güvenlik kontrolcüsü sınıfı
class SecurityChecker {

    // Ana analiz fonksiyonu
    static analyze(header, payload) {
        const issues = [];      // Kritik sorunlar
        const warnings = [];    // Uyarılar
        const info = [];        // Bilgilendirme

        // Tüm kontrolleri yap
        this.checkAlgorithm(header, issues, warnings);
        this.checkPayload(payload, issues, warnings, info);
        this.checkExpiration(payload, warnings, info);

        // Güvenlik skoru hesapla
        const score = this.calculateScore(issues, warnings);

        return {
            issues: issues,
            warnings: warnings,
            info: info,
            score: score
        };
    }

    // Algoritma kontrolü
    static checkAlgorithm(header, issues, warnings) {
        const alg = header.alg;

        if (!alg) {
            warnings.push({
                title: 'Algoritma belirtilmemiş',
                description: 'Header\'da "alg" alanı yok',
                severity: 'MEDIUM'
            });
            return;
        }

        const algLower = alg.toLowerCase();

        // Kritik: alg:none
        if (algLower === 'none') {
            issues.push({
                title: '🚨 KRİTİK: Algoritma "none"',
                description: 'Token imzasız! Kolayca sahtelenebilir.',
                severity: 'CRITICAL',
                fix: 'HS256, RS256 veya ES256 kullanın'
            });
        }
        // Zayıf algoritmalar
        else if (['hs1', 'rs1', 'md5'].includes(algLower)) {
            issues.push({
                title: 'Zayıf algoritma',
                description: `${alg} kullanımdan kaldırılmış ve güvensiz`,
                severity: 'HIGH',
                fix: 'HS256 veya RS256\'ya yükseltin'
            });
        }
        // HMAC uyarısı
        else if (algLower.startsWith('hs')) {
            warnings.push({
                title: 'Simetrik algoritma (HMAC)',
                description: 'Sunucu ve istemci aynı secret key\'i paylaşıyor',
                severity: 'INFO',
                note: 'Dağıtık sistemlerde RS256 daha güvenli olabilir'
            });
        }
    }

    // Payload kontrolü
    static checkPayload(payload, issues, warnings, info) {
        // Hassas kelimeler
        const sensitiveKeys = [
            'password', 'pwd', 'pass', 'secret', 'apikey', 'api_key',
            'creditcard', 'credit_card', 'ssn', 'cvv', 'pin', 'token'
        ];

        // Yüksek yetkili roller
        const dangerousRoles = ['admin', 'superuser', 'root', 'administrator'];

        // Her key'i kontrol et
        for (let key in payload) {
            const keyLower = key.toLowerCase();
            const value = payload[key];

            // Hassas veri kontrolü
            for (let sensitive of sensitiveKeys) {
                if (keyLower.includes(sensitive)) {
                    issues.push({
                        title: '🔴 Hassas veri payload\'da!',
                        description: `"${key}" hassas bilgi içerebilir`,
                        severity: 'CRITICAL',
                        detail: `Değer: ${String(value).substring(0, 20)}...`,
                        fix: 'Asla şifre, API key veya kişisel bilgileri JWT\'de saklamayın'
                    });
                }
            }

            // Role kontrolü - DÜZELTME: Admin role artık ISSUE (kritik)
            if (keyLower === 'role' || keyLower === 'scope' || keyLower === 'permissions') {
                const roleStr = String(value).toLowerCase();
                for (let dangerous of dangerousRoles) {
                    if (roleStr.includes(dangerous)) {
                        issues.push({
                            title: '🚨 Yüksek yetkili rol payload\'da!',
                            description: `Role: ${value}`,
                            severity: 'HIGH',
                            detail: 'Admin/superuser gibi roller JWT payload\'ında açık şekilde görünüyor',
                            fix: 'Rolleri payload\'dan çıkarın veya şifreli JWE kullanın',
                            note: 'Saldırgan bu JWT\'yi decode edip yetkilerinizi görebilir'
                        });
                    }
                }
            }
        }

        // Email kontrolü
        const payloadStr = JSON.stringify(payload);
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

        if (emailRegex.test(payloadStr)) {
            info.push({
                title: 'Email adresi bulundu',
                description: 'JWT payload şifreli değil, sadece base64 encoded',
                severity: 'INFO',
                note: 'Herkes bu bilgiyi decode edip okuyabilir'
            });
        }

        // Telefon numarası kontrolü
        const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/;
        if (phoneRegex.test(payloadStr)) {
            warnings.push({
                title: 'Telefon numarası tespit edildi',
                description: 'Kişisel veriler JWT payload\'ında olmamalı',
                severity: 'MEDIUM'
            });
        }
    }

    // Expiration (süre) kontrolü - DÜZELTME: Expiration olmayışı daha ağır cezalandır
    static checkExpiration(payload, warnings, info) {
        const now = Math.floor(Date.now() / 1000); // Unix timestamp (saniye)

        // exp var mı?
        if (!payload.exp) {
            warnings.push({
                title: '⚠️ Expiration time yok',
                description: 'Token hiç expire olmuyor - SONSUZa kadar geçerli!',
                severity: 'CRITICAL',
                fix: '"exp" claim ekleyin (örn: 1 saat)',
                note: 'Bir kere çalınan token sonsuza kadar kullanılabilir!'
            });
            return;
        }

        const exp = payload.exp;
        const iat = payload.iat || now;

        // Token ömrü
        const lifetime = exp - iat; // saniye
        const lifetimeDays = Math.floor(lifetime / 86400);

        // Çok uzun mu?
        if (lifetime > 365 * 24 * 60 * 60) { // 1 yıldan fazla
            warnings.push({
                title: 'Token ömrü çok uzun',
                description: `Token ${lifetimeDays} gün geçerli`,
                severity: 'HIGH',
                fix: 'Access token için 1 saat, refresh token için max 7 gün önerin'
            });
        }

        // Kalan süre
        const remaining = exp - now;

        if (remaining < 0) {
            // Expire olmuş
            const expiredMinutes = Math.abs(Math.floor(remaining / 60));
            info.push({
                title: 'Token süresi dolmuş',
                description: `${expiredMinutes} dakika önce expire oldu`,
                severity: 'INFO',
                note: 'Sunucu bu token\'ı kabul etmemeli'
            });
        } else {
            // Hala geçerli
            const remainingMinutes = Math.floor(remaining / 60);
            const remainingHours = Math.floor(remainingMinutes / 60);

            let timeStr;
            if (remainingHours > 0) {
                timeStr = `${remainingHours} saat ${remainingMinutes % 60} dakika`;
            } else {
                timeStr = `${remainingMinutes} dakika`;
            }

            info.push({
                title: 'Token geçerli',
                description: `${timeStr} sonra expire olacak`,
                severity: 'INFO'
            });
        }
    }

    // Güvenlik skoru hesapla (0-100) - DÜZELTME: Skor hesaplamasını iyileştir
    static calculateScore(issues, warnings) {
        let score = 100;

        // Her kritik sorun
        issues.forEach(issue => {
            if (issue.severity === 'CRITICAL') {
                score -= 35;
            } else if (issue.severity === 'HIGH') {
                score -= 25;
            }
        });

        // Her uyarı
        warnings.forEach(warning => {
            if (warning.severity === 'CRITICAL') {
                score -= 30;
            } else if (warning.severity === 'HIGH') {
                score -= 15;
            } else if (warning.severity === 'MEDIUM') {
                score -= 8;
            }
        });

        return Math.max(0, score); // Negatif olmasın
    }
}