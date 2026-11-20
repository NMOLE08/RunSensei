import { type Href, useRouter } from 'expo-router';
import { pendingResearchCheckinRoute } from '@/application/researchWorkoutFlow';
import { AppText, Button, Card } from '@/design/components';
import type { PendingResearchCheckin } from '@/application/trackerHistory';

/** A saved GPS activity with no submitted outcome remains recoverable after app restart. */
export function PendingResearchCheckinCard({ checkin }: { checkin: PendingResearchCheckin }) {
  const router = useRouter();
  return <Card tone="butter">
    <AppText variant="label">Feedback not finished</AppText>
    <AppText>Workout on {checkin.plannedDate} has a saved GPS activity. Its outcome is still unreported.</AppText>
    <Button
      label="Complete workout feedback"
      onPress={() => router.push(pendingResearchCheckinRoute(checkin) as Href)}
    />
  </Card>;
}
