declare const researchOnlyBrand: unique symbol;

/** Deliberately incompatible with production-domain inputs unless a future explicit conversion is authorized. */
export type ResearchOnly<T> = T & { readonly researchOnly: true; readonly productionEligible: false; readonly [researchOnlyBrand]: 'RunSensei research-only result' };
export function asResearchOnly<T>(value: T & { researchOnly: true; productionEligible: false }): ResearchOnly<T> { return value as ResearchOnly<T>; }
