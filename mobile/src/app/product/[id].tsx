import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowIcon, HeartIcon, ShareIcon } from '../../components/Icons';
import { PriceChart } from '../../components/PriceChart';
import { Card, SectionTitle } from '../../components/ui';
import { Category, fetchPriceHistory, fetchProduct, Offer, PricePoint, Product, productWebUrl, sellerUrl } from '../../lib/api';
import { displayName, fmtTL, formatGb, specRows } from '../../lib/format';
import { useFavorites, useProducts } from '../../lib/store';
import { colors, fonts, radius } from '../../theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { findById } = useProducts();
  const fav = useFavorites();
  const cached = findById(id);
  const [product, setProduct] = useState<Product | undefined>(cached?.product);
  const [category, setCategory] = useState<Category>(cached?.category ?? 'telefon');
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<PricePoint[] | null>(null);
  const [storage, setStorage] = useState<number | null>(null);
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (product) return;
    fetchProduct(id).then(p => {
      setProduct(p);
      setCategory(p.specs?.cpu ? 'laptop' : 'telefon'); // laptoplarda cpu alanı var
    }).catch(() => setFailed(true));
  }, [id, product]);
  useEffect(() => { fetchPriceHistory(id).then(setHistory).catch(() => setHistory([])); }, [id]);

  // --- varyantlar (depolama + renk) — web'deki GB/renk seçiciyle aynı mantık
  const storages = useMemo(() => {
    const set = new Map<number, boolean>();
    (product?.offers || []).forEach(o => { if (o.storage_gb) set.set(o.storage_gb, (set.get(o.storage_gb) || false) || o.in_stock); });
    return [...set.entries()].sort((a, b) => a[0] - b[0]);
  }, [product]);
  useEffect(() => {
    if (!product || storage !== null || !storages.length) return;
    const firstLive = storages.find(([, live]) => live) || storages[0];
    setStorage(firstLive[0]);
  }, [product, storages, storage]);
  const colors_ = useMemo(() => {
    const set = new Map<string, boolean>();
    (product?.offers || []).filter(o => (storage == null || o.storage_gb === storage) && o.color).forEach(o => set.set(o.color!, (set.get(o.color!) || false) || o.in_stock));
    return [...set.entries()];
  }, [product, storage]);
  useEffect(() => {
    if (!colors_.length) { setColor(null); return; }
    if (color && colors_.some(([c]) => c === color)) return;
    setColor((colors_.find(([, live]) => live) || colors_[0])[0]);
  }, [colors_, color]);

  if (failed) return <View style={s.center}><Text style={s.muted}>Ürün bulunamadı.</Text></View>;
  if (!product) return <View style={s.center}><ActivityIndicator color={colors.signal} /></View>;

  const selected: Offer[] = product.offers
    .filter(o => (storage == null || o.storage_gb === storage) && (!colors_.length || o.color === color))
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || Number(a.price) - Number(b.price));
  const best = selected.find(o => o.in_stock) || null;
  const isLowest = best != null && product.min_price_30d != null && Number(best.price) <= Number(product.min_price_30d) + 0.5;
  const rows = specRows(product, category);
  const favorite = fav.has(product.id);

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
            <Pressable hitSlop={10} onPress={() => Share.share({ message: `${displayName(product.canonical_name)} — fiyatları karşılaştır`, url: productWebUrl(product.id, product.canonical_name) })} accessibilityLabel="Paylaş"><ShareIcon color={colors.text} size={21} /></Pressable>
            <Pressable hitSlop={10} onPress={() => fav.toggle(product.id)} accessibilityLabel="Favorilere ekle veya çıkar"><HeartIcon size={22} color={favorite ? colors.danger : colors.text} filled={favorite} /></Pressable>
          </View>
        ),
      }} />
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={s.brand}>{product.brand}</Text>
        <Text style={s.name}>{displayName(product.canonical_name)}</Text>

        {storages.length > 0 && (
          <View style={s.pills}>
            {storages.map(([gb, live]) => (
              <Pressable key={gb} onPress={() => setStorage(gb)} style={[s.pill, storage === gb && s.pillActive]}>
                <Text style={[s.pillText, storage === gb && { color: colors.signal }, !live && { opacity: 0.5 }]}>{formatGb(gb)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {colors_.length > 0 && (
          <View style={s.pills}>
            {colors_.map(([c, live]) => (
              <Pressable key={c} onPress={() => setColor(c)} style={[s.pill, color === c && s.pillActive]}>
                <Text style={[s.pillText, color === c && { color: colors.signal }, !live && { opacity: 0.5 }]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={s.priceBlock}>
          {best ? (
            <>
              <Text style={s.price}>{fmtTL(best.price)}</Text>
              <Text style={s.seller}>{best.seller_name} üzerinden en uygun fiyat · {selected.filter(o => o.in_stock).length} satıcı</Text>
              {isLowest && <Text style={s.lowest}>↓ Son 30 günün en düşük fiyatı</Text>}
            </>
          ) : (
            <Text style={s.noStock}>Bu seçenek şu an stokta yok</Text>
          )}
        </View>

        <SectionTitle>Satıcılar</SectionTitle>
        {selected.length === 0 && <Text style={s.muted}>Bu seçenek için satıcı bulunamadı.</Text>}
        {selected.map(o => (
          <Card key={o.id} style={[s.offer, !o.in_stock && { opacity: 0.55 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.offerSeller}>{o.seller_name}</Text>
              <Text style={s.offerPrice}>{fmtTL(o.price)}{!o.in_stock ? '  · STOKTA YOK' : ''}</Text>
            </View>
            <Pressable
              disabled={!o.in_stock}
              onPress={() => Linking.openURL(sellerUrl(o.id))}
              style={({ pressed }) => [s.buy, !o.in_stock && { backgroundColor: colors.surface2 }, pressed && { opacity: 0.85 }]}
            >
              <Text style={[s.buyText, !o.in_stock && { color: colors.muted }]}>Satıcıya git</Text>
              {o.in_stock && <ArrowIcon size={14} color="#fff" />}
            </Pressable>
          </Card>
        ))}
        <Text style={s.disclosure}>Reklam: bazı bağlantılar iştirak (affiliate) bağlantısıdır. Fiyat ve stok bilgileri anlık olmayabilir; satın almadan önce satıcıda teyit et.</Text>

        <SectionTitle>Fiyat geçmişi</SectionTitle>
        {history === null ? <ActivityIndicator color={colors.signal} /> : <PriceChart points={history} />}

        <SectionTitle>Teknik özellikler</SectionTitle>
        <Card style={{ padding: 0 }}>
          {rows.map((r, i) => (
            <View key={r.label} style={[s.specRow, i > 0 && s.specBorder]}>
              <Text style={s.specLabel}>{r.label}</Text>
              <Text style={s.specValue}>{r.value}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  brand: { color: colors.signal, fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  name: { color: colors.text, fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, marginTop: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  pillActive: { borderColor: colors.signal, backgroundColor: colors.signalSoft },
  pillText: { color: colors.text, fontFamily: fonts.monoSemi, fontSize: 13 },
  priceBlock: { marginTop: 20 },
  price: { color: colors.text, fontFamily: fonts.monoSemi, fontSize: 32 },
  seller: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, marginTop: 4 },
  lowest: { color: colors.deal, fontFamily: fonts.bodySemi, fontSize: 12.5, marginTop: 8 },
  noStock: { color: colors.muted, fontFamily: fonts.displayMedium, fontSize: 18 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, padding: 14 },
  offerSeller: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
  offerPrice: { color: colors.muted, fontFamily: fonts.mono, fontSize: 14, marginTop: 3 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.signal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buyText: { color: '#fff', fontFamily: fonts.bodySemi, fontSize: 13 },
  disclosure: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  specBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  specLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, flex: 1 },
  specValue: { color: colors.text, fontFamily: fonts.mono, fontSize: 13, flex: 1.2, textAlign: 'right' },
});
