import p1 from '../../../PolicyPack/01_periodization_policy.json';
import p2 from '../../../PolicyPack/02_weekly_training_load_policy.json';
import p3 from '../../../PolicyPack/03_extended_session_policy.json';
import p4 from '../../../PolicyPack/04_workout_selection_policy.json';
import p5 from '../../../PolicyPack/05_volume_distribution_policy.json';
import p6 from '../../../PolicyPack/06_training_pace_policy.json';
import p7 from '../../../PolicyPack/07_intensity_policy.json';
import p8 from '../../../PolicyPack/08_workout_structure_policy.json';
import p9 from '../../../PolicyPack/09_scheduling_and_safety_policy.json';
import c1 from '../../../PolicyPack/continuous_5k_beginner/01_periodization_policy.json';
import c2 from '../../../PolicyPack/continuous_5k_beginner/02_weekly_training_load_policy.json';
import c3 from '../../../PolicyPack/continuous_5k_beginner/03_extended_session_policy.json';
import c4 from '../../../PolicyPack/continuous_5k_beginner/04_workout_selection_policy.json';
import c5 from '../../../PolicyPack/continuous_5k_beginner/05_volume_distribution_policy.json';
import c6 from '../../../PolicyPack/continuous_5k_beginner/06_training_pace_policy.json';
import c7 from '../../../PolicyPack/continuous_5k_beginner/07_intensity_policy.json';
import c8 from '../../../PolicyPack/continuous_5k_beginner/08_workout_structure_policy.json';
import c9 from '../../../PolicyPack/continuous_5k_beginner/09_scheduling_and_safety_policy.json';
import personalization from '../../../PolicyPack/11_beginner_5k_personalization_policy_v0.3.0_draft.json';
import compatibility from '../../../PolicyPack/12_beginner_5k_workload_compatibility_v0.4.0_draft.json';
import calendar from '../../../PolicyPack/15_beginner_5k_calendar_availability_v0.5.0_draft.json';
import successor from '../../../PolicyPack/16_beginner_5k_publication_compatibility_v0.1.0_draft.json';
import { first5kWorkoutPolicyPack } from './first5kPolicyPack';
import { continuous5kWorkoutPolicyPack } from './continuous5kPolicyPack';
import { beginner5kContinuousCandidatePersonalizationPolicy } from './beginner5kPersonalizationPolicy';

/** Signed digest format v1: UTF-8 JSON.stringify of the complete bundled JSON object.
 * Whitespace in files is excluded; property order and every value are included.
 * Derived pack/pathway artifacts are separately signed in addition to their JSON dependencies.
 */
const artifacts = new Map<string, string>();
for (const p of [p1,p2,p3,p4,p5,p6,p7,p8,p9,c1,c2,c3,c4,c5,c6,c7,c8,c9]) artifacts.set(`${p.policy_id}@${p.version}`, JSON.stringify(p));
for (const p of [personalization,compatibility,calendar,successor,first5kWorkoutPolicyPack,continuous5kWorkoutPolicyPack]) artifacts.set(`${p.policyId}@${p.version}`, JSON.stringify(p));
for (const p of beginner5kContinuousCandidatePersonalizationPolicy.pathways) artifacts.set(`${p.id}@${p.version}`, JSON.stringify(p));
export function beginner5kPublicationArtifact(reference: string): string | null { return artifacts.get(reference) ?? null; }
export const publicationCompatibilityReference = `${successor.policyId}@${successor.version}`;
