import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/store';
import { useColors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready } = useApp();
  const c = useColors();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: c.surface }, headerTintColor: c.fg, headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg }, headerBackTitle: 'Retour',
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="new-material" options={{ title: 'Nouveau contenu', presentation: 'modal' }} />
        <Stack.Screen name="exercise/[kind]" options={{ title: 'Exercice' }} />
      </Stack>
    </>
  );
}
