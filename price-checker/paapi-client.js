// price-checker/paapi-client.js — Amazon Product Advertising API (PA-API 5.0)
// istemcisi. Bu, Amazon'un kendi resmi API'si — kullanım şartlarına uygun,
// affiliate hesabına (beko21-21) tanımlı olduğu için scraping DEĞİL.
//
// PA-API 5.0, isteklere AWS Signature Version 4 (SigV4) ile imza atılmasını
// gerektiriyor. Resmi bir npm paketi olmadığı (amzn/paapi5-nodejs-sdk npm'de
// değil, sadece GitHub'da) için imzalamayı burada Node'un yerleşik `crypto`
// modülüyle elle yapıyoruz — ekstra/şüpheli bir bağımlılık eklememek için.
//
// Gerekli ortam değişkenleri (.env'e eklenecek, henüz EKLENMEDİ):
//   PAAPI_ACCESS_KEY   - Associates Central > Tools > Product Advertising API
//   PAAPI_SECRET_KEY   - yukarıdakiyle birlikte verilir
//   PAAPI_PARTNER_TAG  - "beko21-21"
//
// Referans: https://webservices.amazon.com/paapi5/documentation/

const crypto = require('crypto');

const HOST = 'webservices.amazon.com.tr';
const REGION = 'eu-west-1';
const SERVICE = 'ProductAdvertisingAPI';
const MARKETPLACE = 'www.amazon.com.tr';
const ENDPOINT = `https://${HOST}/paapi5/getitems`;

function isConfigured() {
  return Boolean(
    process.env.PAAPI_ACCESS_KEY &&
    process.env.PAAPI_SECRET_KEY &&
    process.env.PAAPI_PARTNER_TAG
  );
}

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest();
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// SigV4 imzası — PA-API'nin gerektirdiği tam biçimde. AWS'in genel SigV4
// tarifiyle aynı, sadece servis adı "ProductAdvertisingAPI".
function signRequest({ accessKey, secretKey, payload, target }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260909T120000Z
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest =
    `POST\n/paapi5/getitems\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { amzDate, authorization };
}

/**
 * Verilen ASIN listesi (en fazla 10 tane, PA-API'nin GetItems limiti) için
 * güncel fiyat/stok bilgisini çeker.
 * @param {string[]} asins
 * @returns {Promise<Map<string, {price: number|null, currency: string|null, inStock: boolean, title: string|null}>>}
 */
async function getItems(asins) {
  if (!isConfigured()) {
    throw new Error('PAAPI_ACCESS_KEY / PAAPI_SECRET_KEY / PAAPI_PARTNER_TAG .env\'de tanımlı değil');
  }
  if (asins.length === 0) return new Map();
  if (asins.length > 10) throw new Error('GetItems tek seferde en fazla 10 ASIN kabul eder');

  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
  const body = {
    ItemIds: asins,
    PartnerTag: process.env.PAAPI_PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: MARKETPLACE,
    Resources: [
      'Offers.Listings.Price',
      'Offers.Listings.Availability.Message',
      'ItemInfo.Title',
    ],
  };
  const payload = JSON.stringify(body);

  const { amzDate, authorization } = signRequest({
    accessKey: process.env.PAAPI_ACCESS_KEY,
    secretKey: process.env.PAAPI_SECRET_KEY,
    payload,
    target,
  });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-encoding': 'amz-1.0',
      'content-type': 'application/json; charset=utf-8',
      'x-amz-date': amzDate,
      'x-amz-target': target,
      'Authorization': authorization,
    },
    body: payload,
  });

  const json = await res.json().catch(() => null);
  if (!res.status || res.status >= 300) {
    const msg = json?.Errors?.[0]?.Message || `PA-API HTTP ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.raw = json;
    throw err;
  }

  const result = new Map();
  for (const item of json?.ItemsResult?.Items || []) {
    const listing = item.Offers?.Listings?.[0];
    result.set(item.ASIN, {
      price: listing?.Price?.Amount ?? null,
      currency: listing?.Price?.Currency ?? null,
      inStock: listing?.Availability?.Message
        ? !/stokta yok|out of stock|tükendi/i.test(listing.Availability.Message)
        : true,
      title: item.ItemInfo?.Title?.DisplayValue ?? null,
    });
  }
  // İstenip de sonuçta hiç dönmeyen ASIN'ler (kaldırılmış/geçersiz ürün) —
  // çağıran tarafın bunu ayırt edebilmesi için Map'te yer almazlar.
  return result;
}

module.exports = { getItems, isConfigured };
