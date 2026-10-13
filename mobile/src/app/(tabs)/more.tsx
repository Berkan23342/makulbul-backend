import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from '../../components/Icons';
import { Card, Logo } from '../../components/ui';
import { API_BASE } from '../../lib/api';
import { colors, fonts } from '../../theme';

const LINKS: { label: string; url: string }[] = [
  { label: 'Alışveriş rehberleri', url: `${API_BASE}/en-iyi` },
  { label: 'Hakkımızda', url: `${API_BASE}/hakkimizda` },
  { label: 'İletişim', url: `${API_BASE}/iletisim` },
  { label: 'Gizlilik Politikası', url: `${API_BASE}/gizlilik-politikasi.html` },
  { label: 'Kullanım Şartları', url: `${API_BASE}/kullanim-sartlari.html` },
];

export default function More() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 16, paddingBottom: 40 }}>
      <Logo />
      <Text style={s.lead}>Telefon ve laptop fiyatlarını satıcılar arasında karşılaştırır, yapay zekâ ile ihtiyacına en uygun ürünü bulur.</Text>
      <Card style={{ padding: 0, marginTop: 22 }}>
        {LINKS.map((l, i) => (
          <Pressable key={l.url} onPress={() => Linking.openURL(l.url)} style={[s.row, i > 0 && s.rowBorder]}>
            <Text style={s.rowText}>{l.label}</Text>
            <ChevronRight color={colors.muted} />
          </Pressable>
        ))}
      </Card>
      <Card style={{ marginTop: 16 }}>
        <Text style={s.noteTitle}>Şeffaflık</Text>
        <Text style={s.note}>Makulbul ürünleri kendisi satmaz; fiyat ve stok bilgilerini satıcı sitelerinden derler ve bunlar anlık olmayabilir. Satın almadan önce satıcının sayfasında teyit et. Bazı bağlantılar iştirak (affiliate) bağlantısıdır; bu, sıralamayı etkilemez.</Text>
      </Card>
      <Text style={s.version}>Sürüm {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  lead: { color: colors.muted, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  noteTitle: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 16, marginBottom: 6 },
  note: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  version: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12, textAlign: 'center', marginTop: 24 },
});
