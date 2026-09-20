import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
// Imported for its side effect: the background task must be defined whenever
// the bundle is evaluated, including a headless wake with no screen mounted.
import '../src/background';
import { useAppFonts } from '../src/useAppFonts';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const ready = useAppFonts();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Holding the splash avoids the flash of system font that would otherwise
  // swap under the reader mid-sentence.
  if (!ready) return null;

  return (
    <>
      <StatusBar style='dark' />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: 'fade',
        }}
      />
    </>
  );
}
