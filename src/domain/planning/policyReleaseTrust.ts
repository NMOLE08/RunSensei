/** Release-engineering configuration. Never populated from runner input or an approval envelope. */
export type PolicyReleaseTrust = Readonly<{
  keys: readonly { id: string; spkiHex: string; reviewer: string; scopes: readonly string[]; references: readonly string[]; revoked: boolean }[];
  revokedArtifactIds: readonly string[];
  validUntil: string | null;
}>;
// No independently established reviewer keys or revocation snapshot have been supplied.
export const policyReleaseTrust: PolicyReleaseTrust = Object.freeze({ keys: Object.freeze([]), revokedArtifactIds: Object.freeze([]), validUntil: null });
