import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import LottieView from 'lottie-react-native';

export type RunSenseiIcon = 'home' | 'calendar' | 'clock' | 'profile' | 'walk' | 'pause' | 'stop' | 'location' | 'trash' | 'exit';

const sources = {
  home: require('../../assets/icons/wired-outline-63-home-hover-partial-roll.json'),
  calendar: require('../../assets/icons/wired-outline-2947-calendar-24-dec-hover-flutter.json'),
  clock: require('../../assets/icons/wired-outline-45-clock-hover-oscillate.json'),
  profile: require('../../assets/icons/wired-outline-268-avatar-man-hover-jump.json'),
  walk: require('../../assets/icons/wired-outline-646-person-walking-hover-walking (1).json'),
  pause: require('../../assets/icons/wired-outline-3096-pause-morph-rotation.json'),
  stop: require('../../assets/icons/wired-outline-3460-stop-sign-hover-pinch.json'),
  location: require('../../assets/icons/wired-outline-18-location-pin-hover-jump.json'),
  trash: require('../../assets/icons/wired-outline-185-trash-bin-morph-trash-in.json'),
  exit: require('../../assets/icons/wired-outline-1725-person-exit-hover-pinch.json'),
} as const;

/** Decorative only: the neighbouring visible label owns the action and accessibility name. */
export function AnimatedIcon({ name, size = 28, active = false, trigger = 0 }: { name: RunSenseiIcon; size?: number; active?: boolean; /** Increment this after an owning control is pressed. */ trigger?: number }) {
  const animation = useRef<LottieView>(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  useEffect(() => { if ((active || trigger > 0) && !reduceMotion) animation.current?.play(); }, [active, reduceMotion, trigger]);
  return <View accessibilityElementsHidden importantForAccessibility="no" pointerEvents="none" style={{ width: size, height: size }}><LottieView ref={animation} source={sources[name]} autoPlay={false} loop={false} progress={reduceMotion ? 0 : undefined} style={{ width: size, height: size }} /></View>;
}
