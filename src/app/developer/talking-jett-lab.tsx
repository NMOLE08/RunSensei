import { router } from 'expo-router';
import { developerTrainingLabEnabled, developerTrainingLabReason } from '@/config/developerTrainingLab';
import { TalkingJettLab } from '@/features/developer/TalkingJettLab';
import { AppText, Button, Card, Screen } from '@/design/components';

export default function TalkingJettLabScreen() {
  if (!developerTrainingLabEnabled) return <Screen><AppText variant="meta">DEVELOPER TOOL / RESTRICTED</AppText><AppText variant="title">Talking Jett Lab unavailable</AppText><Card><AppText>{developerTrainingLabReason({ isDevelopment: __DEV__, trainingLabFlag: process.env.EXPO_PUBLIC_TRAINING_LAB })}</AppText><AppText>This route does not initialize audio or load mascot assets in an unavailable build.</AppText></Card><Button label="Back to settings" tone="secondary" onPress={() => router.replace('/settings')} /></Screen>;
  return <TalkingJettLab />;
}
