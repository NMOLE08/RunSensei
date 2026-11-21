import { router, type Href } from 'expo-router';
import { AppText, Button, Card } from '@/design/components';
import type { PlanAvailability } from '@/domain/assessment/planAvailability';
import { consumerStatusForPlanAvailability, presentPlanAvailability } from './planAvailabilityPresentation';

export function PlanAvailabilityCard({ value }: { value: PlanAvailability }) {
  const status = consumerStatusForPlanAvailability(value);
  const recovery = presentPlanAvailability(value);
  // Publication services own their runner-facing status. For local
  // availability states, use the more specific explanation layer so an
  // unsupported marathon does not look like a missing runner answer.
  const presentation = value.consumerStatus ? { title: status.title, message: status.message } : { title: recovery.title, message: recovery.explanation };
  return <Card>
    <AppText variant="meta">TRAINING PLAN</AppText>
    <AppText variant="title">{presentation.title}</AppText>
    <AppText>{presentation.message}</AppText>
    {status.nextAction.destination !== '/plan' && <Button label={value.consumerStatus ? actionLabel(status.code) : recovery.actionLabel ?? actionLabel(status.code)} tone="secondary" onPress={() => router.push((value.consumerStatus ? status.nextAction.destination : recovery.actionPath ?? status.nextAction.destination) as Href)} />}
    <Button label="Start a run" onPress={() => router.push('/run?mode=run' as Href)} />
  </Card>;
}

function actionLabel(code: ReturnType<typeof consumerStatusForPlanAvailability>['code']) {
  if (code === 'production_authorization_failure' || code === 'plan_persistence_failure' || code === 'publication_conflict') return 'Try again';
  return ({ more_information_needed: 'Add running information', reassessment_required: 'Review your running level', schedule_conflict: 'Edit training days', health_review_required: 'Review health information', program_not_supported: 'Review your goal', policy_approval_pending: 'Review your starting point', preview_available: 'Open preview', plan_ready: 'Open plan' })[code];
}
