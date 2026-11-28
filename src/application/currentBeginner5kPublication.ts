import { loadCurrentAccountPlanFacts } from './planAvailability';
import { acquirePublicationAccount } from '@/services/account/publicationAccount';
import { loadReleaseAuthorization, assertReleaseAuthorizationCurrent } from '@/services/security/loadReleaseAuthorization';
import { readVerifiedReleaseTrust } from '@/services/security/releaseTrust';
import { createExperimental5kPreview, type Experimental5kPreview } from '@/domain/research/experimental5kPreview';
import { requiredBeginner5kPublicationReferences } from '@/domain/planning/beginner5kPublicationPolicy';
import { verifyPolicyRelease } from '@/domain/planning/verifyPolicyRelease';
import { evaluateBeginner5kProductionCompatibility } from '@/domain/planning/beginner5kProductionCompatibility';
import { runnerLocalDate } from '@/domain/planning/beginner5kRunnerEvidence';
import { assessmentEvidenceFingerprint } from '@/domain/assessment/assessmentEvidence';
import { FitnessAssessmentRepository } from '@/data/fitnessAssessmentRepository';
import { TrainingRepository } from '@/data/repositories';
import { openAppDatabase } from '@/data/expoSqliteDatabase';
import { publishBeginner5kInitialWeek } from './beginner5kPublication';
import { consumerPlanStatus, type ConsumerPlanState } from './consumerPlanStatus';
import type { PlanSnapshot } from '@/domain/training/entities';
import { isDateOnly } from '@/domain/calendar/dateOnly';
import { previewIdentityFor, type PlanPreviewIdentity } from './planPreviewIdentity';

export type CurrentBeginner5kPublication = {
  status: ReturnType<typeof consumerPlanStatus>; canPublish: boolean;
  preview?: Experimental5kPreview; snapshot?: PlanSnapshot; previewContext?: PlanPreviewIdentity;
};
type RecoveryField = { field: string; destination: string };
/** A typed, sanitized runner-facing recovery for one publication blocker. */
export type Beginner5kPublicationRecovery = Readonly<RecoveryField & {
  reasonCode: string;
  title: string;
  message: string;
  actionLabel: string;
}>;

const recoveryFields:Record<string,RecoveryField>={
  missing_health_concern:{field:'healthConcern',destination:'/onboarding/running?part=running-interruption&focus=health-concern&returnTo=/plan'},
  missing_available_training_days:{field:'trainingDays',destination:'/onboarding/availability?part=availability-days&returnTo=/plan'},
  missing_first_5k_experience:{field:'first5kExperience',destination:'/onboarding/running?part=first5-check&focus=first-5k-experience&returnTo=/plan'},
  missing_adult_age_confirmed:{field:'adultAgeConfirmed',destination:'/onboarding/running?part=first5-check&focus=adult-confirmation&returnTo=/plan'},
  missing_can_walk_30_minutes_comfortably:{field:'canWalk30MinutesComfortably',destination:'/onboarding/running?part=first5-check&focus=walking-comfort&returnTo=/plan'},
  missing_weekly_running_minutes:{field:'weeklyMinutes',destination:'/onboarding/running?part=running-history&focus=weekly-running&returnTo=/plan'},
  missing_continuous_run_minutes:{field:'comfortableRunMinutes',destination:'/onboarding/running?part=running-capacity&focus=comfortable-running-minutes&returnTo=/plan'},
  missing_longest_recent_session_minutes:{field:'longestSessionMinutes',destination:'/onboarding/running?part=running-capacity&focus=longest-session-minutes&returnTo=/plan'},
  invalid_or_missing_longestSessionDate:{field:'longestSessionDate',destination:'/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan'},
  invalid_or_missing_weeklyEvidenceConfirmedAt:{field:'weeklyEvidenceConfirmedAt',destination:'/onboarding/assessment?returnTo=/plan'},
  invalid_or_missing_currentCapabilityConfirmedAt:{field:'currentCapabilityConfirmedAt',destination:'/onboarding/assessment?returnTo=/plan'},
  missing_plan_start_date:{field:'planStartDate',destination:'/onboarding/goal?part=goal-dates&focus=plan-start-date&returnTo=/plan'},
};

const recoveryFieldLabels:Record<string,string>={
  healthConcern:'your health and interruption answer',
  trainingDays:'the days you can genuinely train',
  first5kExperience:'your first-5K running experience',
  adultAgeConfirmed:'your adult confirmation',
  canWalk30MinutesComfortably:'your 30-minute walking comfort',
  weeklyMinutes:'your recent weekly running minutes',
  comfortableRunMinutes:'your comfortable continuous-running time',
  longestSessionMinutes:'your longest recent session',
  longestSessionDate:'the date of your longest recent session',
  weeklyEvidenceConfirmedAt:'your current weekly-running confirmation',
  currentCapabilityConfirmedAt:'your current running-capacity confirmation',
  planStartDate:'your plan start date',
};

const specificRecovery:Record<string,Omit<Beginner5kPublicationRecovery,'reasonCode'>>={
  assessment_missing_or_outdated:{
    field:'assessment',destination:'/onboarding/assessment?returnTo=/plan',
    title:'Review your current starting point',
    message:'Your saved runner information changed after the last starting-point review. Review it again so the plan can use your current evidence.',
    actionLabel:'Review current assessment',
  },
  interruption_requires_review:{
    field:'interruption',destination:'/onboarding/running?part=running-interruption&focus=recent-interruption&returnTo=/plan',
    title:'Review your recent interruption',
    message:'You reported a recent interruption. Confirm what you can comfortably do now before Torto can compare a plan.',
    actionLabel:'Review recent interruption',
  },
  outdated_running_history:{
    field:'longestSessionDate',destination:'/onboarding/running?part=running-capacity&focus=longest-session-date&returnTo=/plan',
    title:'Update your current running evidence',
    message:'Your recent running evidence is outside the current freshness window. Confirm your current running capacity and longest-session date before the plan can be compared.',
    actionLabel:'Update running evidence',
  },
};

/** Resolves the first known blocker to a single reason-specific recovery. */
export function beginner5kPublicationRecovery(codes:readonly string[]):Beginner5kPublicationRecovery|undefined {
  for(const code of codes){
    const specific=specificRecovery[code];
    if(specific)return {...specific,reasonCode:code};
    const field=recoveryFields[code];
    if(field)return {
      ...field,reasonCode:code,
      title:'Add the information still needed',
      message:`Add ${recoveryFieldLabels[field.field]??'the missing runner information'} so Torto can compare your plan. Your saved information is unchanged.`,
      actionLabel:'Add missing information',
    };
  }
  return undefined;
}

const reassessmentRecoveryCodes=new Set(['assessment_missing_or_outdated','interruption_requires_review','outdated_running_history']);

/** Keeps recovery copy scoped to the category that authored it. */
function recoveryForCategory(kind:Exclude<ConsumerPlanState,'plan_ready'>, codes:readonly string[]) {
  if(kind==='reassessment_required')return beginner5kPublicationRecovery(codes.filter(code=>reassessmentRecoveryCodes.has(code)));
  if(kind==='more_information_needed')return beginner5kPublicationRecovery(codes.filter(code=>!reassessmentRecoveryCodes.has(code)));
  return undefined;
}

export function publicationBlockedStatus(codes:readonly string[], fallback:ConsumerPlanState='production_authorization_failure') {
  const hasRecovery=codes.some(code=>Boolean(specificRecovery[code]??recoveryFields[code]));
  const kind:Exclude<ConsumerPlanState,'plan_ready'> = codes.some(c=>c==='health_concern_reported'||c==='health_hold')?'health_review_required'
    :codes.some(c=>c.includes('interruption')||c.includes('outdated')||c==='assessment_missing_or_outdated')?'reassessment_required'
    :hasRecovery||codes.includes('onboarding_not_started')?'more_information_needed'
    :codes.some(c=>c!=='availability_policy_unavailable'&&(c.includes('schedule')||c.includes('availability')||c.includes('weekday')))?'schedule_conflict'
    :codes.some(c=>c==='publication_revision_conflict'||c==='publication_evidence_changed'||c==='publication_account_changed')?'publication_conflict'
    :codes.some(c=>c==='unsupported_policy_family'||c==='goal_not_supported'||c==='no_explicit_pathway_for_experience'||c==='adult_confirmation_not_met'||c==='walk_30_minutes_not_met'||c.endsWith('_below_candidate_minimum'))?'program_not_supported'
    :fallback==='plan_ready'?'production_authorization_failure':fallback;
  const recovery=recoveryForCategory(kind,codes);
  return consumerPlanStatus({kind,reasonCodes:codes,recovery:recovery?{...recovery,category:kind}:undefined});
}

/** No caller-supplied account, keys, approvals, profile or test-policy override. */
export const getCurrentBeginner5kPublicationStatus = () => run(false);
/** Explicit action only; status reads never publish. */
export const publishCurrentBeginner5kWeekOne = () => run(true);

async function run(publish:boolean):Promise<CurrentBeginner5kPublication> {
  let lease:Awaited<ReturnType<typeof acquirePublicationAccount>>|undefined;
  let preview:Experimental5kPreview|undefined;
  let previewContext: PlanPreviewIdentity | undefined;
  const blocked=(codes:readonly string[],fallback?:ConsumerPlanState):CurrentBeginner5kPublication=>({status:publicationBlockedStatus(codes,fallback),canPublish:false,preview,previewContext});
  try {
    lease=await acquirePublicationAccount();
    const facts=await loadCurrentAccountPlanFacts();await lease.assertCurrent();
    if(facts.ownerId!==lease.ownerId||facts.draft&&facts.draft.ownerId!==lease.ownerId) return blocked(['publication_account_changed']);
    previewContext = previewIdentityFor(facts.ownerId, facts.draft);
    if(!facts.draft) return blocked(['onboarding_not_started']);
    const draft=facts.draft;const now=new Date().toISOString();const today=runnerLocalDate(now,draft.timezone);
    if(!today) return blocked(['invalid_evidence_timezone_or_evaluation_date']);
    const input={ownerId:lease.ownerId,draft,assessment:facts.assessment,nowDate:today};
    const candidate=createExperimental5kPreview(input);
    if(candidate.kind!=='preview') return blocked(candidate.reasonCodes.includes('no_explicit_pathway_for_experience')&&draft.first5kExperience==='unknown'
      ? [...candidate.reasonCodes,'missing_first_5k_experience'] : candidate.reasonCodes);
    preview=candidate;
    const trust=await loadReleaseAuthorization();await lease.assertCurrent();
    if(trust.kind!=='verified') return blocked([trust.code],trust.code==='release_trust_not_configured'?'policy_approval_pending':'production_authorization_failure');
    const release=await verifyPolicyRelease(trust.context.approvals,requiredBeginner5kPublicationReferences(preview),new Date().toISOString(),trust.context);
    if(release.kind!=='verified')return blocked([release.code],'policy_approval_pending');
    const compatibility=evaluateBeginner5kProductionCompatibility(draft,preview,release.release,new Date().toISOString());
    if(compatibility.kind==='blocked') return blocked(compatibility.reasonCodes);
    await lease.assertCurrent();
    if(facts.activeSnapshot) {
      const saved=facts.activeSnapshot;
      const provenance=JSON.parse(saved.revision.explanationJson);
      if(saved.plan.templateId!==`torto.publication.${preview.pathway.id}@${preview.pathway.version}`||saved.plan.validationFingerprint!==preview.inputFingerprint||provenance.authorizationEvidence?.digest!==release.release.digestIdentity||provenance.testOnly===true||saved.assignments.length!==3||saved.plan.recommendationState!=='active')return blocked(['publication_revision_conflict']);
      return {status:consumerPlanStatus({kind:'authorized_persisted_plan',planId:saved.plan.id,policyReference:saved.plan.templateId,authorizationVerified:true}),canPublish:false,snapshot:saved,previewContext};
    }
    if(!publish) return {status:consumerPlanStatus({kind:'preview_available',reasonCodes:['verified_week_one_publication_available']}),canPublish:true,preview,previewContext};
    const database=await openAppDatabase();
    const fingerprint=assessmentEvidenceFingerprint(draft);const owner=lease.ownerId;const activeLease=lease;
    const assertPublicationCurrent=async()=>{
      await activeLease.assertCurrent();
      await assertReleaseAuthorizationCurrent(trust.context);
      if(!readVerifiedReleaseTrust(trust.context,new Date().toISOString())||Date.now()>=Date.parse(release.release.expiresAt))throw new Error('publication_authorization_expired');
      const latest=await new FitnessAssessmentRepository(database,owner).loadDraft();
      if(!latest||assessmentEvidenceFingerprint(latest)!==fingerprint)throw new Error('publication_evidence_changed');
    };
    if(!isDateOnly(draft.planStartDate)||draft.goalDateFixed&&!isDateOnly(draft.goalDate))return blocked(['missing_plan_start_date']);
    const profileId=`account-profile:${owner}`;
    const result=await publishBeginner5kInitialWeek(new TrainingRepository(database,owner),input,{
      profile:{id:profileId,units:draft.units,trainingTimezone:draft.timezone,baselineJson:JSON.stringify({assessmentFingerprint:fingerprint}),version:draft.schemaVersion,createdAt:now,updatedAt:now},
      goal:{id:`account-goal:${owner}`,profileId,mode:draft.goalDateFixed?'fixed_date':'flexible',distanceMeters:5000,raceDate:draft.goalDateFixed?draft.goalDate as `${number}-${number}-${number}`:null,startDate:draft.planStartDate,version:1,createdAt:now},
      availability:{id:`account-availability:${owner}`,profileId,weekdayLimitsJson:JSON.stringify(draft.minuteLimits),preferredLongRunDay:draft.preferredLongDay,exceptionsJson:JSON.stringify(draft.unavailableDates.split(',').filter(Boolean)),version:1,createdAt:now},
    },{now:()=>new Date().toISOString(),id:prefix=>`${prefix}:${owner}`,releaseTrust:trust.context,assertPublicationCurrent},trust.context.approvals);
    await lease.assertCurrent();
    if(result.kind==='published')return {status:consumerPlanStatus({kind:'authorized_persisted_plan',planId:result.snapshot.plan.id,policyReference:result.snapshot.plan.templateId,authorizationVerified:true}),canPublish:false,snapshot:result.snapshot,previewContext};
    if(result.kind==='policy_approval_pending')return blocked(result.blockers.map(b=>b.code),'policy_approval_pending');
    return blocked(result.reasonCodes,result.kind==='persistence_error'?'plan_persistence_failure':'production_authorization_failure');
  } catch(error) {
    if(error instanceof Error&&['publication_account_changed','publication_evidence_changed','publication_authorization_expired'].includes(error.message))return {status:publicationBlockedStatus([error.message]),canPublish:false};
    return {status:consumerPlanStatus({kind:'plan_persistence_failure',reasonCodes:['publication_or_saved_evidence_unavailable']}),canPublish:false};
  } finally {lease?.dispose();}
}
