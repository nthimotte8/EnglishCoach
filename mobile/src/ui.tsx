// Small shared UI kit built on the theme tokens.
import React from 'react';
import {
  ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle,
  View, ViewStyle,
} from 'react-native';
import { useColors, radius } from './theme';

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth * 2,
      borderRadius: radius.m, padding: 16, gap: 12 }, style]}>{children}</View>
  );
}

export function H({ children, size = 17, style }: { children: React.ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ color: c.fg, fontSize: size, fontWeight: '600' }, style]}>{children}</Text>;
}

export function P({ children, muted, style, size = 15 }: {
  children: React.ReactNode; muted?: boolean; style?: StyleProp<TextStyle>; size?: number;
}) {
  const c = useColors();
  return <Text style={[{ color: muted ? c.muted : c.fg, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}

type Variant = 'primary' | 'secondary' | 'quiet';
export function Button({ title, onPress, variant = 'secondary', loading, disabled, icon, style, accessibilityLabel }: {
  title?: string; onPress: PressableProps['onPress']; variant?: Variant; loading?: boolean; disabled?: boolean;
  icon?: React.ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'secondary' ? c.surface : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : variant === 'secondary' ? c.fg : c.accent;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [{
        minHeight: 44, paddingHorizontal: title ? 16 : 0, minWidth: 44, borderRadius: radius.s,
        backgroundColor: bg, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: c.field,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      {title ? <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{title}</Text> : null}
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.subtle}
        accessibilityLabel={label}
        {...props}
        style={[{ minHeight: 44, borderWidth: 1, borderColor: c.field, borderRadius: radius.s, paddingHorizontal: 12,
          paddingVertical: 10, color: c.fg, backgroundColor: c.surface, fontSize: 16 }, style]}
      />
    </View>
  );
}

type Tone = 'neutral' | 'accent' | 'good' | 'bad' | 'warm';
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = useColors();
  const map: Record<Tone, [string, string]> = {
    neutral: [c.chip, c.muted], accent: [c.accentSoft, c.accentStrong], good: [c.goodSoft, c.good],
    bad: [c.badSoft, c.bad], warm: [c.warmBg, c.warmFg],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 13, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export function Notice({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.warmBg, borderRadius: radius.s, padding: 12 }}>
      <Text style={{ color: c.warmFg, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.chip, borderRadius: 10, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? c.surface : 'transparent' }}>
            <Text style={{ color: on ? c.fg : c.muted, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
