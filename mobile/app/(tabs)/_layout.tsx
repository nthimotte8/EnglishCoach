import { Tabs } from 'expo-router';
import React from 'react';
import { BookIcon, ChatIcon, UserIcon } from '@/icons';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.surface }, headerTintColor: c.fg, headerShadowVisible: false,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.subtle,
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Pratiquer', tabBarIcon: ({ color }) => <BookIcon color={color} /> }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: ({ color }) => <ChatIcon color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Mon compte', tabBarIcon: ({ color }) => <UserIcon color={color} /> }} />
    </Tabs>
  );
}
