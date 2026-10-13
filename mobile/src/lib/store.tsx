import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Category, fetchProducts, Product } from './api';

// ---------------------------------------------------------------- ürünler
type ProductsState = {
  products: Record<Category, Product[] | null>;
  loading: Record<Category, boolean>;
  error: Record<Category, string | null>;
  load: (category: Category, force?: boolean) => Promise<void>;
  findById: (id: string) => { product: Product; category: Category } | undefined;
};
const ProductsCtx = createContext<ProductsState | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Record<Category, Product[] | null>>({ telefon: null, laptop: null });
  const [loading, setLoading] = useState<Record<Category, boolean>>({ telefon: false, laptop: false });
  const [error, setError] = useState<Record<Category, string | null>>({ telefon: null, laptop: null });
  const inflight = useRef<Partial<Record<string, Promise<void>>>>({});

  const load = useCallback(async (category: Category, force = false) => {
    if (!force && products[category]) return;
    const existing = inflight.current[category];
    if (existing) return existing;
    setLoading(s => ({ ...s, [category]: true }));
    setError(s => ({ ...s, [category]: null }));
    const job = fetchProducts(category)
      .then(list => setProducts(s => ({ ...s, [category]: list })))
      .catch(e => setError(s => ({ ...s, [category]: e?.message || 'Ürünler yüklenemedi' })))
      .finally(() => {
        setLoading(s => ({ ...s, [category]: false }));
        delete inflight.current[category];
      });
    inflight.current[category] = job;
    return job;
  }, [products]);

  const findById = useCallback((id: string) => {
    for (const category of ['telefon', 'laptop'] as Category[]) {
      const product = products[category]?.find(p => p.id === id);
      if (product) return { product, category };
    }
    return undefined;
  }, [products]);

  const value = useMemo(() => ({ products, loading, error, load, findById }), [products, loading, error, load, findById]);
  return <ProductsCtx.Provider value={value}>{children}</ProductsCtx.Provider>;
}
export function useProducts() {
  const v = useContext(ProductsCtx);
  if (!v) throw new Error('ProductsProvider eksik');
  return v;
}

// -------------------------------------------------------------- favoriler
const FAV_KEY = 'makulbul:favorites:v1';
type FavState = { ids: Set<string>; has: (id: string) => boolean; toggle: (id: string) => void };
const FavCtx = createContext<FavState | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(FAV_KEY).then(raw => {
      if (!raw) return;
      try { setIds(new Set(JSON.parse(raw) as string[])); } catch { /* bozuk kayıt: yok say */ }
    }).catch(() => {});
  }, []);
  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(FAV_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  const value = useMemo(() => ({ ids, has: (id: string) => ids.has(id), toggle }), [ids, toggle]);
  return <FavCtx.Provider value={value}>{children}</FavCtx.Provider>;
}
export function useFavorites() {
  const v = useContext(FavCtx);
  if (!v) throw new Error('FavoritesProvider eksik');
  return v;
}
