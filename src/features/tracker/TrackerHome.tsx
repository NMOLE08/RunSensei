import { router, type Href } from 'expo-router';

import { AppText, Button, Card, Screen } from '@/design/components';

export function TrackerHome() {
  return <Screen>
    <AppText variant="meta">RUNSENSEI / LOCAL TRACKER</AppText>
    <AppText variant="title">Ready to run?</AppText>
    <AppText>Your run is recorded locally on this phone. No account or training plan is required.</AppText>
    <Card>
      <AppText variant="meta">OUTDOOR GPS</AppText>
      <AppText>The clock starts only after location permission is granted and a usable GPS fix is available.</AppText>
      <Button label="Start run" onPress={() => router.push('/run?mode=run' as Href)} accessibilityHint="Opens GPS setup for an outdoor run." />
      <Button label="Start walk" tone="secondary" onPress={() => router.push('/run?mode=walk' as Href)} accessibilityHint="Opens GPS setup for an outdoor walk." />
    </Card>
    <Button label="View local history" tone="secondary" onPress={() => router.push('/history' as Href)} />
  </Screen>;
}
