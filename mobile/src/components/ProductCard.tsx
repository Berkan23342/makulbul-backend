import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Category, Product } from '../lib/api';
import { bestLive, displayName, fmtTL, specSummary } from '../lib/format';
import { colors, fonts, radius } from '../theme';
import { HeartIcon } from './Icons';

type Props = { product: Product; category: Category; favorite: boolean; onPress: () => void; onToggleFavorite: () => void };

export function ProductCard({ product, category, favorite, onPress, onToggleFavorite }: Props) {
  const best = bestLive(product);
  const isLowest = best != null && product.min_price_30d != null && Number(best.price) <= Number(product.min_price_30d) + 0.5;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
      <View style={s.top}>
        <Text style={s.brand} numberOfLines={1}>{product.brand}</Text>
        <Pressable onPress={onToggleFavorite} hitSlop={10} style={[s.fav, favorite && s.favActive]} accessibilityLabel="Favorilere ekle veya çıkar">
          <HeartIcon size={14} color={favorite ? '#fff' : colors.muted} filled={favorite} />
        </Pressable>
      </View>
      {/* iki satırlık sabit alan: kısa başlıklı kartlar da hizalı kalsın */}
      <Text style={s.name} numberOfLines={2}>{displayName(product.canonical_name)}</Text>
      <Text style={s.specs} numberOfLines={2}>{specSummary(product, category)}</Text>
      <View style={s.bottom}>
        {best ? (
          <>
            <Text style={s.price}>{fmtTL(best.price)}</Text>
            <Text style={s.lowest}>{isLowest ? '↓ Son 30 günün en düşüğü' : ' '}</Text>
            <Text style={s.seller} numberOfLines={1}>{best.seller_name}</Text>
          </>
        ) : (
          <>
            <Text style={s.noStock}>Şu an stokta yok</Text>
            <Text style={s.lowest}> </Text>
            <Text style={s.seller}> </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, margin: 5 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  brand: { flex: 1, color: colors.signal, fontFamily: fonts.bodySemi, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  fav: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  favActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  name: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 15, lineHeight: 20, minHeight: 40 },
  specs: { color: colors.muted, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, marginTop: 6, minHeight: 32 },
  bottom: { marginTop: 'auto', paddingTop: 12 },
  price: { color: colors.text, fontFamily: fonts.monoSemi, fontSize: 16 },
  lowest: { color: colors.deal, fontFamily: fonts.bodySemi, fontSize: 10.5, marginTop: 4 },
  seller: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  noStock: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
});
