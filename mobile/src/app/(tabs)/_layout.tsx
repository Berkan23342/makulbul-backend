import { Tabs } from 'expo-router';
import { GridIcon, HeartIcon, MoreIcon } from '../../components/Icons';
import { colors, fonts } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.deal,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Katalog', tabBarIcon: ({ color }) => <GridIcon color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favoriler', tabBarIcon: ({ color }) => <HeartIcon color={color} size={22} /> }} />
      <Tabs.Screen name="more" options={{ title: 'Daha Fazla', tabBarIcon: ({ color }) => <MoreIcon color={color} /> }} />
    </Tabs>
  );
}
