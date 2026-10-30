import { useColorScheme } from 'react-native';

const light = {
  bg: '#F3F5F7', surface: '#FFFFFF', fg: '#15202B', muted: '#4A5663', subtle: '#5D6975',
  line: '#DCE1E6', lineSoft: '#E4E8EC', field: '#C7CED6',
  accent: '#1F4FA8', accentStrong: '#163B7E', accentSoft: '#E8EEF8', onAccent: '#FFFFFF',
  chip: '#EEF1F4', warmBg: '#FBEBDD', warmFg: '#8A3D0F',
  good: '#1D6B44', goodSoft: '#E1F2E8', bad: '#A3241C', badSoft: '#FBE6E4',
  heat: ['#EEF1F4', '#B9CBEA', '#6E92D3', '#1F4FA8'],
  video: '#1B232C',
};
const dark: typeof light = {
  bg: '#0F151B', surface: '#17202A', fg: '#E6EBF0', muted: '#AAB5C0', subtle: '#93A0AC',
  line: '#2A3540', lineSoft: '#24303B', field: '#3A4754',
  accent: '#86A9F0', accentStrong: '#ADC5F5', accentSoft: '#1E2C46', onAccent: '#0D1320',
  chip: '#222D38', warmBg: '#3A2616', warmFg: '#F2BC92',
  good: '#7AD3A0', goodSoft: '#173326', bad: '#F4958C', badSoft: '#3B1D1B',
  heat: ['#222D38', '#2B4473', '#4C74C2', '#86A9F0'],
  video: '#0A0F14',
};
export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = { mono: 'Menlo' };
export const radius = { s: 8, m: 12 };
