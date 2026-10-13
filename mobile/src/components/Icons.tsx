import { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { size?: number; color?: ColorValue; filled?: boolean };
const base = (size: number, color: ColorValue) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const HeartIcon = ({ size = 20, color = '#fff', filled }: P) => (
  <Svg {...base(size, color)} fill={filled ? color : 'none'}>
    <Path d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.4 3.4 4.2 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" />
  </Svg>
);
export const GridIcon = ({ size = 22, color = '#fff' }: P) => (
  <Svg {...base(size, color)}>
    <Rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Svg>
);
export const MoreIcon = ({ size = 22, color = '#fff' }: P) => (
  <Svg {...base(size, color)}><Circle cx="5" cy="12" r="1.2" fill={color} /><Circle cx="12" cy="12" r="1.2" fill={color} /><Circle cx="19" cy="12" r="1.2" fill={color} /></Svg>
);
export const ShareIcon = ({ size = 20, color = '#fff' }: P) => (
  <Svg {...base(size, color)}><Path d="M12 3v12" /><Path d="M7.5 7.5 12 3l4.5 4.5" /><Path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7" /></Svg>
);
export const ChevronRight = ({ size = 18, color = '#fff' }: P) => (
  <Svg {...base(size, color)}><Path d="m9 6 6 6-6 6" /></Svg>
);
export const ArrowIcon = ({ size = 16, color = '#fff' }: P) => (
  <Svg {...base(size, color)}><Path d="M5 12h14" /><Path d="m13 6 6 6-6 6" /></Svg>
);
export const SearchIcon = ({ size = 20, color = '#fff' }: P) => (
  <Svg {...base(size, color)}><Circle cx="11" cy="11" r="6.5" /><Path d="m20 20-4-4" /></Svg>
);
