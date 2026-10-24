import type { UnitSystem } from './entities';
import { metersToDisplay } from '@/domain/units';

export interface AuthoredStep { label: string; instruction: string; durationSeconds?: number; distanceMeters?: number; }
export interface AuthoredPrescription { week: number; target: { durationSeconds?: number; distanceMeters?: number }; purpose: string; effortCue: string; steps: AuthoredStep[]; approvedAlternatives: string[]; }

export function decodePrescription(value: string): AuthoredPrescription | null { try { const parsed = JSON.parse(value) as Partial<AuthoredPrescription>; if (!parsed.target || typeof parsed.purpose !== 'string' || typeof parsed.effortCue !== 'string' || !Array.isArray(parsed.steps) || !Array.isArray(parsed.approvedAlternatives)) return null; return parsed as AuthoredPrescription; } catch { return null; } }
export function formatTarget(prescription: AuthoredPrescription, units: UnitSystem): string | null { if (prescription.target.durationSeconds !== undefined) return `${Math.round(prescription.target.durationSeconds / 60)} min`; if (prescription.target.distanceMeters !== undefined) return `${metersToDisplay(prescription.target.distanceMeters, units).toFixed(units === 'metric' ? 1 : 2)} ${units === 'metric' ? 'km' : 'mi'}`; return null; }
