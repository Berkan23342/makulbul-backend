import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { PricePoint } from '../lib/api';
import { fmtTL } from '../lib/format';
import { colors, fonts, radius } from '../theme';

const H = 120;
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const m = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];
  return `${d.getDate()} ${m}`;
};

export function PriceChart({ points }: { points: PricePoint[] }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  if (points.length < 2) {
    return <Text style={s.empty}>Henüz yeterli fiyat geçmişi yok — fiyat değiştikçe burada görünecek.</Text>;
  }
  const prices = points.map(p => Number(p.price));
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const pad = 8;
  const x = (i: number) => pad + (i / (points.length - 1)) * Math.max(w - pad * 2, 1);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number(p.price)).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const last = points[points.length - 1];
  return (
    <View style={s.box}>
      <View onLayout={onLayout}>
        {w > 0 && (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.signal} stopOpacity="0.35" />
                <Stop offset="1" stopColor={colors.signal} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#g)" />
            <Path d={line} stroke={colors.signal} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(points.length - 1)} cy={y(Number(last.price))} r={4} fill={colors.bg} stroke={colors.signal} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <View style={s.axis}>
        <Text style={s.axisText}>{dayLabel(points[0].date)}</Text>
        <Text style={s.axisText}>{dayLabel(last.date)}</Text>
      </View>
      <View style={s.summary}>
        <View><Text style={s.sumLabel}>En düşük</Text><Text style={s.sumVal}>{fmtTL(min)}</Text></View>
        <View><Text style={s.sumLabel}>En yüksek</Text><Text style={s.sumVal}>{fmtTL(max)}</Text></View>
        <View><Text style={s.sumLabel}>Güncel</Text><Text style={s.sumVal}>{fmtTL(last.price)}</Text></View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10.5 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  sumLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  sumVal: { color: colors.text, fontFamily: fonts.monoSemi, fontSize: 13, marginTop: 2 },
});
