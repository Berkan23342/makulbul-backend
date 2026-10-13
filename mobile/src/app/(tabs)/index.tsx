import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowIcon, SearchIcon } from '../../components/Icons';
import { ProductCard } from '../../components/ProductCard';
import { Card, Chip, Logo, PrimaryButton, Segmented } from '../../components/ui';
import { aiSearch, AiResult, Category, Product } from '../../lib/api';
import { bestLive, displayName } from '../../lib/format';
import { useFavorites, useProducts } from '../../lib/store';
import { colors, fonts, radius } from '../../theme';

const CONFIG: Record<Category, {
  placeholder: string; chips: string[]; notFound: string;
  sorts: { key: string; label: string; value: (p: Product) => number }[];
}> = {
  telefon: {
    placeholder: "örn. NFC'li, 25.000 TL altı, kamerası iyi bir telefon",
    chips: ["NFC'li 20.000 TL altı", 'kamerası iyi 40.000 TL altı', 'pili uzun ucuz telefon', 'en güçlü telefon'],
    notFound: 'telefon',
    sorts: [
      { key: 'price', label: 'En uygun fiyat', value: p => priceOf(p) },
      { key: 'battery', label: 'Pil', value: p => -(Number(p.specs.battery_mah) || 0) },
      { key: 'camera', label: 'Kamera', value: p => -(Number(p.specs.main_camera_mp) || 0) },
    ],
  },
  laptop: {
    placeholder: 'örn. oyun için güçlü, 50.000 TL altı bir laptop',
    chips: ['oyun için güçlü laptop', 'öğrenci için hafif laptop', '30000 TL altı ucuz laptop', 'ofis için uzun pilli laptop'],
    notFound: 'laptop',
    sorts: [
      { key: 'price', label: 'En uygun fiyat', value: p => priceOf(p) },
      { key: 'ram', label: 'RAM', value: p => -(Number(p.specs.ram_gb) || 0) },
      { key: 'screen', label: 'Ekran boyutu', value: p => -(Number(p.specs.screen_inch) || 0) },
    ],
  },
};
// stokta olmayanlar en sona
function priceOf(p: Product) { const b = bestLive(p); return b ? Number(b.price) : Number.MAX_SAFE_INTEGER; }

export default function Catalog() {
  const insets = useSafeAreaInsets();
  const { products, loading, error, load } = useProducts();
  const fav = useFavorites();
  const [category, setCategory] = useState<Category>('telefon');
  const [brand, setBrand] = useState('all');
  const [sortKey, setSortKey] = useState('price');
  const [query, setQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const cfg = CONFIG[category];
  const list = products[category];

  useEffect(() => { load(category); }, [category, load]);
  useEffect(() => { setBrand('all'); setSortKey('price'); setAi(null); setAiError(null); setQuery(''); }, [category]);

  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    (list || []).forEach(p => counts.set(p.brand, (counts.get(p.brand) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
  }, [list]);

  const shown = useMemo(() => {
    const sort = cfg.sorts.find(s => s.key === sortKey) || cfg.sorts[0];
    return (list || []).filter(p => brand === 'all' || p.brand === brand).sort((a, b) => sort.value(a) - sort.value(b) || priceOf(a) - priceOf(b));
  }, [list, brand, sortKey, cfg]);

  async function runSearch(text: string) {
    const q = text.trim();
    if (!q) return;
    Keyboard.dismiss();
    setQuery(q); setAiLoading(true); setAi(null); setAiError(null);
    try { setAi(await aiSearch(q, category)); }
    catch { setAiError('Arama şu an çalışmıyor. İnternet bağlantını kontrol edip tekrar dene.'); }
    finally { setAiLoading(false); }
  }

  const header = (
    <View>
      <View style={s.headRow}><Logo /></View>
      <Segmented<Category> value={category} onChange={setCategory} options={[{ value: 'telefon', label: '📱 Telefonlar' }, { value: 'laptop', label: '💻 Laptoplar' }]} />

      <Text style={s.hero}>İhtiyacını yaz, <Text style={{ color: colors.signal }}>{category === 'telefon' ? 'en ucuz telefonu' : 'en uygun laptopu'}</Text> bulalım.</Text>
      <View style={s.searchBox}>
        <SearchIcon size={18} color={colors.muted} />
        <TextInput
          style={s.input} value={query} onChangeText={setQuery} placeholder={cfg.placeholder} placeholderTextColor={colors.muted}
          returnKeyType="search" onSubmitEditing={() => runSearch(query)} autoCorrect={false}
        />
      </View>
      <PrimaryButton label="Ara" onPress={() => runSearch(query)} disabled={!query.trim() || aiLoading} style={{ marginTop: 10 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {cfg.chips.map(c => <Chip key={c} label={c} onPress={() => runSearch(c)} />)}
      </ScrollView>

      {aiLoading && <View style={s.aiBox}><ActivityIndicator color={colors.signal} /><Text style={s.aiHint}>Karşılaştırılıyor…</Text></View>}
      {aiError && <Card style={{ marginTop: 14 }}><Text style={s.aiHint}>{aiError}</Text></Card>}
      {ai && !aiLoading && (
        <Card style={{ marginTop: 14, borderColor: ai.pick ? '#3a4a1a' : colors.border }}>
          {ai.pick ? (
            <>
              <Text style={s.aiTag}>SANA EN UYGUN SEÇİM</Text>
              <Text style={s.aiName}>{displayName(ai.pick.canonical_name)}</Text>
              {ai.reasons.map(r => <Text key={r} style={s.aiReason}>• {r}</Text>)}
              <PrimaryButton label="Ürünü gör" icon={<ArrowIcon color={colors.dealInk} />} onPress={() => router.push({ pathname: '/product/[id]', params: { id: ai.pick!.id } })} style={{ marginTop: 12 }} />
            </>
          ) : (
            <>
              <Text style={s.aiName}>{ai.message || `Bu kriterlere uyan bir ${cfg.notFound} bulunamadı`}</Text>
              {(ai.hints?.length ? ai.hints : ['Farklı bir bütçe veya özellik kombinasyonu dene']).map(h => <Text key={h} style={s.aiReason}>• {h}</Text>)}
            </>
          )}
        </Card>
      )}

      <Text style={s.sectionTitle}>Tüm {category === 'telefon' ? 'telefonlar' : 'laptoplar'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <Chip label="Tümü" active={brand === 'all'} onPress={() => setBrand('all')} />
        {brands.map(b => <Chip key={b} label={b} active={brand === b} onPress={() => setBrand(b)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.chipRow, { marginBottom: 6 }]}>
        <Text style={s.sortLabel}>Sırala:</Text>
        {cfg.sorts.map(o => <Chip key={o.key} label={o.label} active={sortKey === o.key} onPress={() => setSortKey(o.key)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
      <FlatList
        key={category}
        data={shown}
        keyExtractor={p => p.id}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={{ alignItems: 'stretch' }}
        contentContainerStyle={{ paddingHorizontal: 11, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={!!list && loading[category]} onRefresh={() => load(category, true)} tintColor={colors.signal} />}
        renderItem={({ item }) => (
          <ProductCard
            product={item} category={category} favorite={fav.has(item.id)}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
            onToggleFavorite={() => fav.toggle(item.id)}
          />
        )}
        ListEmptyComponent={
          loading[category] && !list ? <View style={s.center}><ActivityIndicator color={colors.signal} /><Text style={s.aiHint}>Ürünler yükleniyor…</Text></View>
          : error[category] ? <View style={s.center}><Text style={s.aiHint}>{error[category]}</Text><PrimaryButton label="Tekrar dene" onPress={() => load(category, true)} style={{ marginTop: 12 }} /></View>
          : <View style={s.center}><Text style={s.aiHint}>Bu kritere uyan ürün bulunamadı.</Text></View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headRow: { paddingVertical: 12, paddingHorizontal: 5 },
  hero: { color: colors.text, fontFamily: fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.4, marginTop: 22, paddingHorizontal: 5 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, marginTop: 14, marginHorizontal: 5 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingVertical: 13 },
  chipRow: { gap: 8, paddingVertical: 12, paddingHorizontal: 5, alignItems: 'center' },
  sortLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginRight: 2 },
  sectionTitle: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 20, marginTop: 14, paddingHorizontal: 5 },
  aiBox: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 14, paddingHorizontal: 5 },
  aiHint: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  aiTag: { color: colors.deal, fontFamily: fonts.monoSemi, fontSize: 11, letterSpacing: 0.8, marginBottom: 6 },
  aiName: { color: colors.text, fontFamily: fonts.display, fontSize: 19, lineHeight: 24 },
  aiReason: { color: colors.muted, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, marginTop: 4 },
  center: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 8 },
});
