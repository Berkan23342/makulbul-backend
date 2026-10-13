import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCard } from '../../components/ProductCard';
import { Category, Product } from '../../lib/api';
import { useFavorites, useProducts } from '../../lib/store';
import { colors, fonts } from '../../theme';

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const { products, load } = useProducts();
  const fav = useFavorites();
  useEffect(() => { load('telefon'); load('laptop'); }, [load]);

  const items: { product: Product; category: Category }[] = [];
  (['telefon', 'laptop'] as Category[]).forEach(c => (products[c] || []).forEach(p => { if (fav.has(p.id)) items.push({ product: p, category: c }); }));

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
      <Text style={s.title}>Favorilerim</Text>
      <FlatList
        data={items}
        keyExtractor={i => i.product.id}
        numColumns={2}
        columnWrapperStyle={{ alignItems: 'stretch' }}
        contentContainerStyle={{ paddingHorizontal: 11, paddingBottom: 32, flexGrow: 1 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item.product} category={item.category} favorite
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.product.id } })}
            onToggleFavorite={() => fav.toggle(item.product.id)}
          />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Henüz favori ürünün yok</Text>
            <Text style={s.emptyText}>Bir ürünün üzerindeki kalp simgesine dokunarak ekleyebilirsin. Favorilerin yalnızca bu cihazda saklanır.</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26, paddingHorizontal: 16, paddingVertical: 12 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30, gap: 8 },
  emptyTitle: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 18 },
  emptyText: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
