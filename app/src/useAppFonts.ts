import { useFonts } from 'expo-font';

/**
 * Four faces, deliberately. Every extra weight is bundle weight on a phone that
 * may be old and on a connection that may be slow.
 */
export function useAppFonts() {
  const [loaded, error] = useFonts({
    Fraunces_400Regular: require('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf'),
    Fraunces_600SemiBold: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  });

  // A font that fails to load must not hold the app hostage. Falling through to
  // the system face is far better than a permanent splash screen.
  return loaded || Boolean(error);
}
