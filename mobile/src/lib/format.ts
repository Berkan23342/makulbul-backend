import type { Offer, Product } from './api';

/** 26999 -> "26.999 TL", 30046.35 -> "30.046,35 TL" (Intl'e bağımlı değil) */
export function fmtTL(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const hasFraction = Math.abs(n - Math.round(n)) > 0.004;
  const [int, frac] = (hasFraction ? n.toFixed(2) : String(Math.round(n))).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${grouped}${frac ? ',' + frac : ''} TL`;
}

export function formatGb(gb: number | null | undefined): string {
  const n = Number(gb);
  if (!n) return '';
  return n >= 1024 && n % 1024 === 0 ? `${n / 1024}TB` : `${n}GB`;
}

/** "Apple iPhone 17 256GB" -> "Apple iPhone 17" (depolama/RAM seçilebilir seçenek, başlıkta olmasın) */
export function displayName(canonical: string): string {
  return String(canonical || '')
    .replace(/\s*\b\d+\s?(GB|TB)\b/gi, '')
    .replace(/\//g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const liveOffers = (p: Product): Offer[] => p.offers.filter(o => o.in_stock);

export function bestLive(p: Product): Offer | null {
  const live = liveOffers(p);
  if (!live.length) return null;
  return live.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
}

const BOOL = (v: any) => (v ? 'Var' : 'Yok');
const SPEC_PHONE: [string, string, (v: any) => string][] = [
  ['ram_gb', 'RAM', v => `${v} GB`],
  ['storage_gb', 'Depolama', v => formatGb(v)],
  ['screen_inch', 'Ekran', v => `${v}"`],
  ['refresh_rate_hz', 'Yenileme Hızı', v => `${v} Hz`],
  ['battery_mah', 'Batarya', v => `${v} mAh`],
  ['chip', 'Çip', v => String(v)],
  ['main_camera_mp', 'Ana Kamera', v => `${v} MP`],
  ['ultra_wide_mp', 'Geniş Açı Kamera', v => `${v} MP`],
  ['telephoto_mp', 'Telefoto Kamera', v => `${v} MP`],
  ['optical_zoom_x', 'Optik Zoom', v => `${v}x`],
  ['front_camera_mp', 'Ön Kamera', v => `${v} MP`],
  ['weight_g', 'Ağırlık', v => `${v} g`],
  ['ip_rating', 'Su/Toz Direnci', v => String(v)],
  ['wired_charging_watts', 'Kablolu Şarj', v => `${v} W`],
  ['wireless_charging_watts', 'Kablosuz Şarj', v => `${v} W`],
  ['has_nfc', 'NFC', BOOL],
  ['has_5g', '5G', BOOL],
  ['screen_nits', 'Ekran Parlaklığı', v => `${v} nit`],
  ['build_material', 'Gövde Malzemesi', v => String(v)],
  ['sim_type', 'SIM Desteği', v => String(v)],
  ['is_foldable', 'Katlanabilir', v => (v ? 'Evet' : 'Hayır')],
  ['release_year', 'Çıkış Yılı', v => String(v)],
];
const SPEC_LAPTOP: [string, string, (v: any) => string][] = [
  ['cpu', 'İşlemci', v => String(v)],
  ['cpu_cores', 'Çekirdek Sayısı', v => String(v)],
  ['ram_gb', 'RAM', v => `${v} GB`],
  ['storage_gb', 'Depolama', v => formatGb(v)],
  ['storage_type', 'Depolama Türü', v => String(v)],
  ['gpu', 'Ekran Kartı', v => String(v)],
  ['screen_inch', 'Ekran Boyutu', v => `${v}"`],
  ['screen_resolution', 'Çözünürlük', v => String(v)],
  ['refresh_rate_hz', 'Yenileme Hızı', v => `${v} Hz`],
  ['has_touchscreen', 'Dokunmatik Ekran', BOOL],
  ['battery_wh', 'Batarya', v => `${v} Wh`],
  ['weight_g', 'Ağırlık', v => (v >= 1000 ? `${(v / 1000).toFixed(2).replace('.', ',')} kg` : `${v} g`)],
  ['has_backlit_keyboard', 'Aydınlatmalı Klavye', BOOL],
  ['has_fingerprint', 'Parmak İzi Okuyucu', BOOL],
  ['webcam_mp', 'Webcam', v => `${v} MP`],
  ['os', 'İşletim Sistemi', v => String(v)],
  ['release_year', 'Çıkış Yılı', v => String(v)],
];

export function specRows(p: Product, category: string): { label: string; value: string }[] {
  const table = category === 'laptop' ? SPEC_LAPTOP : SPEC_PHONE;
  const out: { label: string; value: string }[] = [];
  for (const [key, label, fmt] of table) {
    const v = p.specs?.[key];
    if (v === undefined || v === null || v === '') continue;
    out.push({ label, value: fmt(v) });
  }
  return out;
}

/** Kartta gösterilecek kısa özellik satırı */
export function specSummary(p: Product, category: string): string {
  const s = p.specs || {};
  const bits: string[] = [];
  if (category === 'laptop') {
    if (s.cpu) bits.push(String(s.cpu));
    if (s.ram_gb) bits.push(`${s.ram_gb} GB`);
    if (s.screen_inch) bits.push(`${s.screen_inch}"`);
  } else {
    if (s.chip) bits.push(String(s.chip));
    if (s.ram_gb) bits.push(`${s.ram_gb} GB RAM`);
    if (s.battery_mah) bits.push(`${s.battery_mah} mAh`);
  }
  return bits.join(' · ');
}
