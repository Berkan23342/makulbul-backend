import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, radius } from '../theme';

export function Logo() {
  return (
    <View style={s.logo}>
      <View style={s.logoMark}><View style={s.logoDot} /></View>
      <Text style={s.logoText}>makulbul</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.chip, active && s.chipActive, pressed && { opacity: 0.8 }]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map(o => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, value === o.value && s.segItemActive]}>
          <Text style={[s.segText, value === o.value && s.segTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, icon, style }: { label: string; onPress?: () => void; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, disabled && s.btnDisabled, pressed && { opacity: 0.85 }, style]}>
      <Text style={[s.btnText, disabled && { color: colors.muted }]}>{label}</Text>
      {icon}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

const s = StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  logoDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.deal },
  logoText: { color: colors.text, fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  chipActive: { backgroundColor: colors.signalSoft, borderColor: colors.signal },
  chipText: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  chipTextActive: { color: '#b9bdff' },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3 },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segItemActive: { backgroundColor: colors.signal },
  segText: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 14 },
  segTextActive: { color: '#fff' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.deal, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 18 },
  btnDisabled: { backgroundColor: colors.surface2 },
  btnText: { color: colors.dealInk, fontFamily: fonts.bodySemi, fontSize: 15 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16 },
  sectionTitle: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 18, marginBottom: 12, marginTop: 26 },
});
