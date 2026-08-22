// email.js — Paylaşılan e-posta gönderme yardımcı fonksiyonu.
// server.js (onay e-postası) ve check-price-alerts.js (fiyat düştü
// bildirimi) burayı kullanır, aynı mantığı iki yerde tekrar etmeyelim.
//
// .env dosyasına RESEND_API_KEY eklersen gerçek e-posta gönderir
// (resend.com — ücretsiz plana sahip basit bir e-posta API'si).
// Anahtar yoksa ne gönderileceğini konsola yazar (stub mod) — canlı
// e-posta servisi olmadan da geliştirme/test yapılabilsin diye.

require('dotenv').config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'Cepfiyat <alerts@cepfiyat.example>';

async function sendEmail({ to, subject, text }) {
  if (!RESEND_API_KEY) {
    console.log(`[STUB — e-posta servisi bağlı değil] Gönderilecek olan e-posta:`);
    console.log(`  Kime: ${to}`);
    console.log(`  Konu: ${subject}`);
    console.log(`  İçerik:\n${text.split('\n').map(l => '    ' + l).join('\n')}`);
    return { sent: false, stub: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: ALERT_FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend API hatası: ${res.status} ${await res.text()}`);
  }
  return { sent: true, stub: false };
}

module.exports = { sendEmail };
