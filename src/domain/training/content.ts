import type { DateOnly } from '@/domain/calendar/dateOnly';

export type ReviewState = 'draft' | 'reviewed' | 'retired';
export type SessionRole = 'easy' | 'long' | 'quality';
export type PhaseName = 'foundation' | 'endurance_development' | 'race_preparation' | 'taper';
export type PlanningReasonCode = 'no_compatible_template' | 'demo_content_only' | 'unreviewed_content' | 'unsupported_frequency' | 'unsupported_duration' | 'entry_requirements_not_met' | 'fixed_date_incompatible' | 'availability_pattern_incompatible' | 'day_time_limit_exceeded' | 'unavailable_date_conflict' | 'spacing_violation' | 'weekly_load_violation' | 'long_run_progression_violation' | 'phase_order_invalid' | 'protected_taper_invalid';

export interface ContentProvenance { author: string; reviewer: string | null; reviewDate: DateOnly | null; rightsSourceNotes: string; reviewState: ReviewState; demoOnly: boolean; }
export interface SessionBlueprint { role: SessionRole; durationSeconds: number; purpose: string; effortCue: string; priority: 'standard' | 'protected'; steps: { label: string; instruction: string; durationSeconds?: number }[]; approvedAlternatives: string[]; }
export interface TemplatePhase { name: PhaseName; weeks: number; sessions: SessionBlueprint[]; }
export interface PlanTemplate extends ContentProvenance { id: string; semanticVersion: string; engineCompatibility: string; supportedGoal: '5k_completion' | '10k_completion' | 'half_marathon_completion'; trainingFrequencyPerWeek: number; authoredDurationWeeks: number; allowedWeeklyPatterns: number[][]; entryRequirementReference: string; phases: TemplatePhase[]; ruleConfigId: string; }
export interface RuleConfig extends ContentProvenance { id: string; semanticVersion: string; engineCompatibility: string; maxWeeklyDurationSeconds: number; maxLongRunIncreaseSeconds: number; minRecoveryDaysBetweenRuns: number; protectedTaperWeeks: number; }
export interface PlanningProfile { entryRequirementsMet: boolean; }
export interface PlanningGoal { mode: 'fixed_date' | 'flexible'; startDate: DateOnly; raceDate: DateOnly | null; distanceMeters: number; }
export interface PlanningAvailability { weekdayMinuteLimits: Record<number, number>; preferredLongRunDay: number | null; unavailableDates: DateOnly[]; }
export interface PlanningRequest { profile: PlanningProfile; goal: PlanningGoal; availability: PlanningAvailability; templateMode: 'demo' | 'real'; }
export interface GeneratedSession { id: string; logicalKey: string; week: number; plannedDate: DateOnly; phase: PhaseName; role: SessionRole; durationSeconds: number; purpose: string; effortCue: string; steps: { label: string; instruction: string; durationSeconds?: number }[]; approvedAlternatives: string[]; }
export interface PlanPreview { templateId: string; templateVersion: string; ruleVersion: string; mode: 'demo' | 'real'; inputFingerprint: string; sessions: GeneratedSession[]; schedulePattern: number[]; warnings: PlanningReasonCode[]; }
export type GenerationResult = { kind: 'preview'; preview: PlanPreview } | { kind: 'infeasible'; reasonCodes: PlanningReasonCode[] };
