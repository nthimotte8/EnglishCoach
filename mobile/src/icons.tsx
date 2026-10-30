// Stroke icons drawn with react-native-svg (no icon font needed).
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { color: string; size?: number };
const base = (size: number, color: string) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const MicIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Rect x={9} y={3} width={6} height={11} rx={3} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
);
export const StopIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Rect x={6} y={6} width={12} height={12} rx={2} /></Svg>
);
export const PlayIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Path d="M7 5l12 7-12 7z" /></Svg>
);
export const SpeakerIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Path d="M11 5L6 9H3v6h3l5 4z" /><Path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></Svg>
);
export const SendIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>
);
export const BookIcon = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}><Path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><Path d="M4 19V5" /></Svg>
);
export const ChatIcon = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}><Path d="M4 5h16v11H9l-5 4z" /></Svg>
);
export const UserIcon = ({ color, size = 22 }: P) => (
  <Svg {...base(size, color)}><Circle cx={12} cy={8} r={4} /><Path d="M4 21a8 8 0 0 1 16 0" /></Svg>
);
export const PlusIcon = ({ color, size = 20 }: P) => (
  <Svg {...base(size, color)}><Path d="M12 5v14M5 12h14" /></Svg>
);
