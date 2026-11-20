import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { experimental5kPreviewEnabled } from '@/config/experimental5kPreview';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadResearchFoundationHistory } from '@/application/researchFoundation';
import { FoundationProgramPreview } from '@/features/execution/FoundationProgramPreview';
import { AppText, Button, Screen } from '@/design/components';
import type { FoundationProgram } from '@/domain/planning/researchFoundation';
import type { ResearchOutcomeRequest } from '@/features/execution/ResearchFoundationProgress';
import { ResearchFoundationProgress } from '@/features/execution/ResearchFoundationProgress';
import { researchWorkoutHistoryRoute } from '@/application/researchWorkoutFlow';

function single(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }

export default function ResearchFoundationScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ blockId?: string; assignmentId?: string; activityId?: string; focus?: string }>();
  const blockId = single(params.blockId); const assignmentId = single(params.assignmentId); const activityId = single(params.activityId);
  const focusFeedback = single(params.focus) === 'feedback';
  const outcomeRequest: ResearchOutcomeRequest | undefined = blockId && assignmentId && activityId ? { blockId, assignmentId, activityId } : undefined;
  if (!experimental5kPreviewEnabled || !user) return <Screen><AppText>Research history is unavailable.</AppText></Screen>;
  return <SavedResearch key={user.id} owner={user.id} outcomeRequest={outcomeRequest} focusFeedback={focusFeedback} />;
}
function SavedResearch({ owner, outcomeRequest, focusFeedback }: { owner: string; outcomeRequest?: ResearchOutcomeRequest; focusFeedback: boolean }) {
  const router = useRouter();
  const [program, setProgram] = useState<FoundationProgram | null>(null); const [message, setMessage] = useState('Loading research history…'); const [feedbackAlreadySaved, setFeedbackAlreadySaved] = useState(false);
  const requestedBlockId = outcomeRequest?.blockId; const requestedAssignmentId = outcomeRequest?.assignmentId; const requestedActivityId = outcomeRequest?.activityId;
  useFocusEffect(useCallback(() => { let alive = true; setFeedbackAlreadySaved(false); const request = requestedBlockId && requestedAssignmentId && requestedActivityId ? { blockId: requestedBlockId, assignmentId: requestedAssignmentId, activityId: requestedActivityId } : undefined; void loadResearchFoundationHistory(owner).then(rows => { if (!alive) return; const target = request ? rows.find(row => row.block.id === request.blockId) : rows.at(-1); if (request && !target) { setProgram(null); setMessage('This saved research workout is not available for the current account. The GPS activity remains in History.'); return; } if (request && !target?.block.assignments.some(assignment => assignment.assignmentId === request.assignmentId)) { setProgram(null); setMessage('This workout does not belong to that saved research block. The GPS activity remains in History.'); return; } if (request && target && target.outcomes.some(outcome => outcome.assignmentId === request.assignmentId && outcome.associatedActivityId === request.activityId)) setFeedbackAlreadySaved(true); setProgram(target?.block.program ?? null); setMessage(rows.length ? '' : 'No research block saved yet. Open the experimental Plan preview and explicitly save it first.'); }).catch(e => { if (alive) setMessage(String(e)); }); return () => { alive = false; }; }, [owner, requestedBlockId, requestedAssignmentId, requestedActivityId]));
  if (focusFeedback && outcomeRequest && feedbackAlreadySaved) return <Screen><AppText variant="title">Feedback already saved</AppText><AppText>This activity’s workout feedback is already recorded. It has not been reopened as an incomplete check-in.</AppText><Button label="View History" onPress={() => router.replace(researchWorkoutHistoryRoute as Href)} /></Screen>;
  if (focusFeedback && outcomeRequest) return <Screen><AppText variant="title">Post-workout check-in</AppText>{program && <ResearchFoundationProgress program={program} onView={() => undefined} outcomeRequest={outcomeRequest} focusedAssignmentId={outcomeRequest.assignmentId} onFeedbackComplete={() => router.replace(researchWorkoutHistoryRoute as Href)} />}{message ? <AppText>{message}</AppText> : null}</Screen>;
  return <Screen><AppText variant="title">Saved research training</AppText>{program && <FoundationProgramPreview value={program} outcomeRequest={outcomeRequest} onRegenerate={() => setMessage('Open Plan to generate a preview from updated information. Saved blocks remain unchanged.')} />}<AppText>{message}</AppText></Screen>;
}
