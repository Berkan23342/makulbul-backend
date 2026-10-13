// Makulbul web sitesiyle aynı tasarım dili (public/index.html :root değişkenleri)
export const colors = {
  bg: '#0a0a0e',
  surface: '#16171f',
  surface2: '#1e202b',
  border: '#2a2c38',
  text: '#edeef3',
  muted: '#9a9db0',
  signal: '#7c82ff',
  signalSoft: '#1b1c3d',
  deal: '#c8ff4d',
  dealInk: '#12140a',
  danger: '#ff6b6b',
} as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
