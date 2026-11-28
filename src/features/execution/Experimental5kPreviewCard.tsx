import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AppText, Button, Card, Disclosure } from '@/design/components';
import type { CurrentExperimental5kPreview } from '@/application/experimental5kPreview';
import type { First5kDraftSession } from '@/domain/planning/first5kPolicyPack';
import { colors, spacing } from '@/design/tokens';
import { editPathForRequirement, targetForOnboardingRequirement, type OnboardingRequirement } from '@/domain/assessment/onboardingRequirements';
import { formatSeconds } from './workoutPresentation';
import { PlanSummaryCard, PlanWeekCalendar, PlanWorkoutSummaryCard } from './ResearchPlanComponents';
import { presentBeginner5kPlan } from './researchPlanPresentation';
import { internalBeginner5kCoachingReview } from '@/config/internalCoachingReview';

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const reasonCopy: Record<string, string> = {
  onboarding_not_started: 'Finish and save your runner information first.',
  assessment_missing_or_outdated: 'Review your starting point again after changing runner information.',
  experimental_program_requires_exactly_three_days: 'These experimental programmes require exactly three available training days. Your profile remains valid; this preview is simply not available for the current schedule.',
  availability_requires_three_nonconsecutive_days: 'Choose three non-consecutive days so there is a recovery day between sessions.',
  health_concern_reported: 'A reported health concern blocks this experimental preview.',
  interruption_requires_review: 'A reported interruption needs review before a draft programme can be previewed.',
  goal_not_supported: 'The current experimental programmes support only a finish-focused first 5K goal.',
  no_explicit_pathway_for_experience: 'The saved running-experience answer does not match an existing experimental pathway.',
  weekday_time_limit_below_prescribed_session: 'The current schedule cannot fit every authored workout.',
  missing_weekday_time_limit_evidence: 'This older preview cannot be compared with the saved availability.',
  missing_weekday_minute_limits: 'This older preview cannot be compared with the saved availability.',
  missing_continuous_running_evidence: 'Add comfortable continuous-running information to compare the continuous-running draft.',
  missing_weekly_running_minutes: 'Add recent weekly running minutes to compare the continuous-running draft.',
  missing_longest_recent_session: 'Add your recent longest session to compare the continuous-running draft.',
  outdated_running_history: 'Update your recent running information before comparing an experimental draft.',
  unsupported_policy_family: 'The saved goal is not supported by the experimental beginner 5K policy family. Your goal has not been changed.',
  two_day_policy_not_authored: 'Your two-day availability is valid profile information, but no reviewed or experimental two-day workout policy has been authored.',
  no_three_day_recovery_pattern: 'The selected days cannot form a three-session week with the required recovery spacing.',
  unconfirmed_time_limit: 'This older preview cannot be compared with the saved availability.',
  session_exceeds_time_limit: 'The current schedule cannot fit every authored workout.',
  fixed_goal_date_conflict: 'The authored final 5K date does not match the fixed goal date. No date compression rule is available.',
  assessment_needs_base_build: 'The general assessment indicates foundation work, but the applicable run/walk pathway will be checked separately when its own entry conditions are complete.',
  missing_first_5k_experience: 'Choose whether your previous 5K running experience is limited or substantial before Torto can select an exact draft pathway.',
  adult_confirmation_not_met: 'This draft run/walk pathway is limited to adults who confirm the policy’s entry condition.',
  walk_30_minutes_not_met: 'This draft run/walk pathway requires confirmation that you can comfortably walk for 30 minutes.',
  continuous_capacity_below_candidate_minimum: 'The continuous-running draft requires more current continuous-running evidence. Torto will not substitute a workload.',
  weekly_running_minutes_below_candidate_minimum: 'The continuous-running draft requires more current weekly running evidence. Torto will not substitute a workload.',
  longest_session_below_candidate_minimum: 'The continuous-running draft requires a longer recent session. Torto will not substitute a workload.',
};

export function Experimental5kPreviewCard({ value, selectedWeek, onSelectedWeekChange, onRegenerate, canPublish = false, onPublish, publishing = false, publicationError = null }: { value: CurrentExperimental5kPreview; selectedWeek?: number; onSelectedWeekChange?: (week: number) => void; onRegenerate: () => void; canPublish?: boolean; onPublish?: () => void; publishing?: boolean; publicationError?: string | null }) {
  if (value.kind !== 'preview') return <BlockedPreview value={value} onRegenerate={onRegenerate} />;
  return <Preview value={value} selectedWeek={selectedWeek} onSelectedWeekChange={onSelectedWeekChange} onRegenerate={onRegenerate} canPublish={canPublish} onPublish={onPublish} publishing={publishing} publicationError={publicationError} />;
}

function BlockedPreview({ value, onRegenerate }: { value: Exclude<CurrentExperimental5kPreview, { kind: 'preview' }>; onRegenerate: () => void }) {
  const reasons = value.reasonCodes.map((reason) => reasonCopy[reason] ?? 'This plan preview is not available with the saved information.');
  const feasibility = 'feasibility' in value ? value.feasibility : null; const conflict = feasibility && feasibility.kind !== 'feasible' ? feasibility.conflicts[0] : null;
  const requirement = requirementFor5kReason(value.reasonCodes);
  return <Card style={styles.warningCard}>
    <AppText variant="meta">PLAN PREVIEW</AppText>
    <AppText variant="title">{blockedTitle(value.reasonCodes)}</AppText>
    <AppText>{reasons[0] ?? 'Update your saved running information, then try again.'}</AppText>
    {conflict && <Card style={styles.conflictCard}><AppText variant="meta">WHAT DOES NOT FIT</AppText><AppText variant="label">{conflict.week ? `Week ${conflict.week} · Workout ${conflict.workout}` : 'Schedule constraint'}</AppText><AppText>{friendlyConflict(conflict)}</AppText><AppText style={styles.warning}>Change only availability that is genuinely available. Torto will not increase the limit or shorten the authored workout automatically.</AppText></Card>}
    <AppText style={styles.warning}>Plan preview — not active yet.</AppText>
    {__DEV__ && feasibility && <Disclosure title="Technical details" summary="Developer-only scheduling diagnostics"><View style={styles.technical}><AppText variant="meta">FREQUENCY · {feasibility.frequency.authoredSessionsPerWeek} AUTHORED / {feasibility.frequency.availableDays} AVAILABLE</AppText>{feasibility.attempts.map((attempt, index) => <View key={`${attempt.weekdays.join('-')}-${index}`}><AppText variant="meta">ATTEMPT {index + 1} · DAYS {attempt.weekdays.join(', ')} · {attempt.feasible ? 'FEASIBLE' : 'BLOCKED'}</AppText>{attempt.conflicts.map((item, conflictIndex) => <AppText key={`${item.code}-${conflictIndex}`} variant="meta">{item.code} · W{item.week ?? '—'}{item.workout ?? ''} · {item.date ?? '—'} · required {item.requiredMinutes ?? 'unknown'} min · available {item.availableMinutes ?? 'unknown'} min · {item.policyReference}</AppText>)}</View>)}</View></Disclosure>}
    {requirement ? <Button label={`Edit ${targetForOnboardingRequirement(requirement).label}`} tone="secondary" onPress={() => router.push(editPathForRequirement(requirement) as Href)} /> : <Button label="Review starting point" tone="secondary" onPress={() => router.push('/onboarding/assessment?returnTo=/plan' as Href)} />}
    <Button label="Check preview again" tone="secondary" onPress={onRegenerate} />
    <Button label="Start a run" onPress={() => router.push('/run?mode=run' as Href)} />
  </Card>;
}

function blockedTitle(reasonCodes: readonly string[]) {
  if (reasonCodes.includes('health_concern_reported')) return 'Health review required';
  if (reasonCodes.includes('interruption_requires_review')) return 'Review your return to running';
  if (reasonCodes.includes('missing_first_5k_experience')) return 'Choose your running experience';
  if (reasonCodes.includes('walk_30_minutes_not_met') || reasonCodes.includes('adult_confirmation_not_met')) return 'Run/walk entry condition not met';
  if (reasonCodes.some((reason) => reason.includes('continuous_') || reason.includes('weekly_running_minutes_below') || reason.includes('longest_session_below'))) return 'Continuous-running pathway needs more evidence';
  if (reasonCodes.some((reason) => reason.includes('schedule') || reason.includes('time_limit') || reason.includes('three_day'))) return 'Adjust your training schedule';
  if (reasonCodes.some((reason) => reason.includes('missing_'))) return 'Add your running information';
  return 'No matching draft programme';
}

function requirementFor5kReason(reasons: readonly string[]): OnboardingRequirement | null {
  if (reasons.includes('missing_first_5k_experience')) return 'first_5k_experience';
  if (reasons.includes('adult_confirmation_not_met')) return 'adult_confirmation';
  if (reasons.includes('walk_30_minutes_not_met')) return 'walking_comfort';
  if (reasons.includes('missing_continuous_running_evidence')) return 'comfortable_running_minutes';
  if (reasons.includes('missing_weekly_running_minutes') || reasons.includes('outdated_running_history')) return 'recent_weekly_running';
  if (reasons.includes('missing_longest_recent_session')) return 'longest_session_minutes';
  if (reasons.includes('interruption_requires_review')) return 'recent_interruption';
  if (reasons.some((reason) => ['experimental_program_requires_exactly_three_days', 'availability_requires_three_nonconsecutive_days', 'no_three_day_recovery_pattern'].includes(reason))) return 'training_days';
  return null;
}

function Preview({ value, selectedWeek, onSelectedWeekChange, onRegenerate, canPublish, onPublish, publishing, publicationError }: { value: Extract<CurrentExperimental5kPreview, { kind: 'preview' }>; selectedWeek?: number; onSelectedWeekChange?: (week: number) => void; onRegenerate: () => void; canPublish: boolean; onPublish?: () => void; publishing: boolean; publicationError: string | null }) {
  const [uncontrolledWeek, setUncontrolledWeek] = useState(initialPreviewWeek); const [expanded, setExpanded] = useState<string | null>(null);
  const plan = useMemo(() => presentBeginner5kPlan(value), [value]);
  const week = Math.max(1, Math.min(12, selectedWeek ?? uncontrolledWeek));
  const setWeek = (next: number) => onSelectedWeekChange ? onSelectedWeekChange(Math.max(1, Math.min(12, next))) : setUncontrolledWeek(Math.max(1, Math.min(12, next)));
  const sessions = value.sessions.filter((session) => session.week === week);
  const recoveryWeek = week === 4 || week === 8;
  const weekTotal = sessions.reduce((total, session) => total + (session.durationSeconds ?? 0), 0);
  return <>
    <PlanSummaryCard plan={plan} status="Personalized calendar generated from your saved profile." />
    <Card style={styles.experimentalCard}>
      <View style={styles.heroTop}><View style={styles.heroCopy}><AppText variant="meta">{previewPathwayLabel(value.pathway.id)}</AppText><AppText variant="title">Your training plan</AppText><AppText style={styles.heroDescription}>Three authored sessions each week, paced by effort—not pace targets.</AppText></View><View style={styles.heroWeek}><AppText variant="label">12</AppText><AppText variant="meta">WEEKS</AppText></View></View>
      <AppText variant="meta">TRAINING DAYS · {value.feasibility.selectedWeekdays.map((day) => days[day]).join(' · ')}</AppText>
      {__DEV__ && <Disclosure title="Technical details" summary="Developer-only plan information"><AppText variant="meta">STRICT GATE · {value.strictProductionGate.kind.replaceAll('_', ' ').toUpperCase()}</AppText><AppText variant="meta">CURRENT POLICY · {value.pathway.id}@{value.pathway.version}</AppText><AppText variant="meta">SUPPLIED REVIEW REFERENCE · {internalBeginner5kCoachingReview.reviewedPolicy}</AppText><AppText variant="meta">REVIEWER · {internalBeginner5kCoachingReview.reviewerId} · {internalBeginner5kCoachingReview.decision.toUpperCase()}</AppText><AppText variant="meta">EXACT POLICY / CRYPTOGRAPHIC MATCH · INCOMPLETE</AppText></Disclosure>}
    </Card>
    <PlanWeekCalendar plan={plan} week={week} onWeekChange={setWeek} selectedWorkoutId={expanded} onSelectWorkout={(id) => setExpanded((current) => current === id ? null : id)} recoveryLabel={recoveryWeek ? 'Recovery week' : null} />
    {weekTotal > 0 && <Card style={styles.weekCard}><View style={styles.weekFacts}><AppText variant="meta">{sessions.length} SESSIONS</AppText><AppText variant="meta">{formatSeconds(weekTotal)} SCHEDULED</AppText></View>{recoveryWeek && <AppText style={styles.recovery}>Recovery week: this protected lower-load structure comes from the draft policy pack.</AppText>}</Card>}
    {plan.workouts.filter((workout) => workout.week === week).map((workout) => <PlanWorkoutSummaryCard key={workout.id} workout={workout} expanded={expanded === workout.id} onToggle={() => setExpanded((current) => current === workout.id ? null : workout.id)} />)}
    <Card>{publicationError && <AppText style={styles.error}>{publicationError}</AppText>}{canPublish && onPublish && <Button label={publishing ? 'Activating plan…' : 'Activate approved Week 1'} disabled={publishing} onPress={onPublish} />}<Button label="Refresh plan" tone="secondary" disabled={publishing} onPress={onRegenerate} /><Button label="Edit running information" tone="secondary" disabled={publishing} onPress={() => router.push('/onboarding/running?returnTo=/plan' as Href)} /><Button label="Start a run" disabled={publishing} onPress={() => router.push('/run?mode=run' as Href)} /></Card>
  </>;
}

export function initialPreviewWeek() { return 1; }
export function movePreviewWeek(current: number, direction: -1 | 1) { return Math.max(1, Math.min(12, current + direction)); }
export function calendarMonthYear(daysInWeek: readonly { date: string }[]) { const first = daysInWeek[0]?.date; return first ? new Date(`${first}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Training week'; }
export function previewWorkoutName(session: First5kDraftSession | undefined) { if (!session) return 'Workout'; if (session.distanceMeters === 5000) return '5K event'; const hasRun = session.steps.some((step) => step.kind === 'run'); const hasWalk = session.steps.some((step) => step.kind === 'walk'); return hasRun && hasWalk ? 'Run/walk workout' : hasRun ? 'Easy run' : 'Workout'; }
export function shortWorkoutLabel(session: First5kDraftSession) { const name = previewWorkoutName(session); return name === 'Run/walk workout' ? 'R/W' : name === 'Easy run' ? 'RUN' : name === '5K event' ? '5K' : 'WORK'; }
export function previewPathwayLabel(pathwayId: string) {
  if (pathwayId === 'continuous_running_beginner_fixed_12_week') return 'BEGINNER 5K · CONTINUOUS RUNNING';
  if (pathwayId === 'true_beginner_fixed_12_week_run_walk') return 'BEGINNER 5K · RUN / WALK';
  return 'BEGINNER 5K · TRAINING PLAN';
}
function friendlyConflict(conflict: { code: string; week: number | null; workout: string | null; date: string | null; weekday: number | null; requiredMinutes: number | null; availableMinutes: number | null; details: string }) { if (conflict.code === 'session_exceeds_time_limit') return `${conflict.date ? `${days[conflict.weekday ?? 0]} ${conflict.date}: ` : ''}the full authored session needs ${conflict.requiredMinutes} minutes, but the confirmed limit is ${conflict.availableMinutes} minutes.`; if (conflict.code === 'unconfirmed_time_limit') return `${conflict.date ? `${days[conflict.weekday ?? 0]} ${conflict.date}: ` : ''}the saved ${conflict.availableMinutes ?? 'unknown'}-minute value has not been confirmed as the runner’s actual availability.`; return conflict.details; }

const styles = StyleSheet.create({
  warningCard: { borderColor: colors.error }, experimentalCard: { backgroundColor: colors.surface, borderColor: colors.dividerStrong, padding: spacing.md }, heroTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' }, heroCopy: { flex: 1, gap: spacing.xs }, heroDescription: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 }, heroWeek: { alignItems: 'center', backgroundColor: colors.mossWash, borderRadius: 18, gap: 1, minWidth: 58, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, statusLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, previewDot: { backgroundColor: colors.coral, borderRadius: 4, height: 8, width: 8 }, warning: { color: colors.accentInk, fontSize: 14, lineHeight: 20 }, activationStatus: { borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth, gap: 2, marginTop: spacing.xs, paddingTop: spacing.sm }, error: { color: colors.error, fontSize: 14, lineHeight: 20 }, productionBlock: { color: colors.error, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }, conflictCard: { backgroundColor: colors.accentWash, padding: spacing.md }, technicalToggle: { alignItems: 'center', borderColor: colors.divider, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md }, technical: { backgroundColor: colors.canvas, borderRadius: 12, gap: spacing.sm, padding: spacing.sm },
  weekCard: { gap: spacing.md }, weekHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, weekHeading: { alignItems: 'center', gap: 2 }, arrow: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, disabled: { opacity: 0.35 },
  dayStrip: { flexDirection: 'row', gap: 3 }, day: { alignItems: 'center', borderColor: colors.divider, borderRadius: 10, borderWidth: 1, flex: 1, gap: 3, minHeight: 68, justifyContent: 'center', paddingVertical: spacing.xs }, plannedDay: { backgroundColor: colors.ink, borderColor: colors.ink }, plannedText: { color: colors.onInk }, weekFacts: { borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm }, recovery: { color: colors.accentInk, fontSize: 14, lineHeight: 20 },
  sessionCard: { gap: spacing.sm, overflow: 'hidden', position: 'relative' }, sessionAccent: { borderTopWidth: 5, left: 0, position: 'absolute', right: 0, top: 0 }, sessionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingTop: spacing.xs }, sessionCopy: { flex: 1, gap: 3 }, sessionSummary: { color: colors.mutedInk, fontSize: 14, lineHeight: 20 }, sessionTarget: { alignItems: 'flex-end', gap: 4 }, sessionChevron: { color: colors.mutedInk, fontSize: 25, lineHeight: 26 }, steps: { borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingTop: spacing.md },
});
