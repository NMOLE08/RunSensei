import { AppText, Card, Disclosure } from '@/design/components';
import type { PreparedPlanCandidateView } from '@/application/preparedPlanCandidate';

/**
 * Non-blocking provenance for a restored calendar. A changed profile never
 * deletes or hides the saved plan; it only tells the runner what to review.
 * A later health signal keeps the calendar visible but states the safety hold.
 */
export function PreparedPlanCandidateNotice({ value }: { value?: PreparedPlanCandidateView }) {
  const healthHold = value?.healthHold;
  if (healthHold?.active) return <Card>
    <AppText variant="meta">SAVED CALENDAR · SAFETY HOLD</AppText>
    <AppText variant="label">Your saved calendar is kept, but training changes are paused</AppText>
    <AppText>The calendar below is the plan prepared earlier. New health information requires review before this plan can be activated, published, or rebuilt. No saved workouts in that calendar have been changed; do not treat it as cleared for training.</AppText>
    <AppText>Finish the health review before asking Torto for a fresh calendar.</AppText>
    {__DEV__ && <Disclosure title="Technical details" summary="Developer-only safety reasons"><AppText variant="meta">{healthHold.reasonCodes.join(' · ')}</AppText></Disclosure>}
  </Card>;
  const mismatch = value?.staleAgainstCurrentProfile;
  if (!mismatch?.changed) return null;
  return <Card>
    <AppText variant="meta">SAVED CALENDAR</AppText>
    <AppText variant="label">This calendar was prepared from earlier information</AppText>
    <AppText>Your saved calendar is still shown below. Review it against your current profile, or refresh it to rebuild it from the information saved now.</AppText>
    {__DEV__ && <Disclosure title="Technical details" summary="Developer-only evidence fingerprints"><AppText variant="meta">PREPARED · {mismatch.generatedEvidenceFingerprint}</AppText><AppText variant="meta">CURRENT · {mismatch.currentEvidenceFingerprint}</AppText></Disclosure>}
  </Card>;
}
