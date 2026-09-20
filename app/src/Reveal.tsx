import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  /** Stagger, in milliseconds, so a screen settles rather than snapping. */
  delay?: number;
  style?: ViewStyle;
};

/**
 * A short fade and lift on first paint. Deliberately slow and small: this is a
 * product people open when they are anxious, and motion that draws attention to
 * itself is the opposite of what it should feel like.
 */
export function Reveal({ children, delay = 0, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
