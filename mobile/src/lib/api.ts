import Constants from 'expo-constants';

export const API_BASE: string = (Constants.expoConfig?.extra?.apiBase as string) || 'https://makulbul.com';

export type Category = 'telefon' | 'laptop';

export type Offer = {
  id: string;
  product_id: string;
  price: string;
  currency: string;
  affiliate_url: string;
  in_stock: boolean;
  storage_gb: number | null;
  color: string | null;
  seller_name: string;
};

export type Product = {
  id: string;
  canonical_name: string;
  brand: string;
  category?: string;
  specs: Record<string, any>;
  best_price: string | null;
  min_price_30d: string | null;
  offers: Offer[];
};

export type AiResult = {
  pick: (Pick<Product, 'id' | 'canonical_name'> & { best_price?: number | string | null; specs?: Record<string, any> }) | null;
  reasons: string[];
  candidates?: unknown[];
  message?: string;
  hints?: string[];
};

export type PricePoint = { date: string; price: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`API hatası (${res.status})`);
  return (await res.json()) as T;
}

export const fetchProducts = (category: Category) =>
  request<Product[]>(`/api/products?category=${category}`);

export const fetchProduct = (id: string) => request<Product>(`/api/products/${encodeURIComponent(id)}`);

export const fetchPriceHistory = (id: string, days = 90) =>
  request<PricePoint[]>(`/api/products/${encodeURIComponent(id)}/price-history?days=${days}`);

export const aiSearch = (query: string, category: Category) =>
  request<AiResult>('/api/ai-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, category }),
  });

/** Satıcıya yönlendirme — sunucu tıklamayı sayar ve affiliate bağlantısına 302 verir. */
export const sellerUrl = (offerId: string) => `${API_BASE}/satici-git/${encodeURIComponent(offerId)}`;
export const productWebUrl = (id: string, name: string) => `${API_BASE}/urun/${id}/${slugify(name)}`;

export function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
