import * as SecureStore from 'expo-secure-store';
import { policyAuthorizationConfig } from '@/config/policyAuthorization';
import { loadReleaseAuthorization, assertReleaseAuthorizationCurrent } from '@/services/security/loadReleaseAuthorization';
import { signedReleaseFixture, releaseTestTime } from '../support/releaseApprovalFixtures';
import type { ReleaseTrustPayload } from '@/services/security/releaseTrust';

jest.mock('@/config/policyAuthorization', () => ({ policyAuthorizationConfig: { endpoint: null, roots: [] }, authorizationClockSkewMs: 300000, authorizationRequestTimeoutMs: 15000 }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
let fixture: Awaited<ReturnType<typeof signedReleaseFixture>>;
let payload: ReleaseTrustPayload;
let stored: string | null;
const originalFetch = globalThis.fetch;
beforeAll(async () => { fixture = await signedReleaseFixture(); });
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date(releaseTestTime));
  payload = JSON.parse(JSON.stringify(fixture.payload));
  stored = null;
  Object.assign(policyAuthorizationConfig, { endpoint: 'https://test.invalid/authorization', roots: [fixture.root] });
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => stored);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key, value) => { stored = value; });
  globalThis.fetch = jest.fn(async (_url, options: any) => ({ ok: true, json: async () => fixture.signTrust({ ...payload, requestNonce: JSON.parse(options.body).nonce }) })) as any;
});
afterEach(() => { globalThis.fetch = originalFetch; jest.useRealTimers(); });

test('persisted trust version binds an in-flight capability and survives a new request', async () => {
  const first = await loadReleaseAuthorization();
  if (first.kind !== 'verified') throw new Error(first.code);
  await expect(assertReleaseAuthorizationCurrent(first.context)).resolves.toBeUndefined();
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  payload.version++;
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  await expect(assertReleaseAuthorizationCurrent(first.context)).rejects.toThrow('publication_authorization_expired');
});

test('same trust version cannot change its roster', async () => {
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  payload.keys[0]!.reviewer = 'changed reviewer';
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'trust_version_content_conflict' });
});

test('changed reviewer identity needs a newer key version as well as a newer roster', async () => {
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  payload.version++;
  payload.keys[0]!.reviewer = 'changed reviewer';
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'reviewer_key_rotation_invalid' });
  payload.keys[0]!.version++;
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  payload.version++;
  payload.keys[0]!.version--;
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'reviewer_key_rotation_invalid' });
});

test('revoked key cannot be restored, even after omission from a later roster', async () => {
  payload.keys[0]!.revoked = true;
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  const oldKey = { ...payload.keys[0]! };
  payload = { ...payload, version: 2, keys: [{ ...oldKey, id: 'replacement', revoked: false }] };
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  payload = { ...payload, version: 3, keys: [{ ...oldKey, version: 2, revoked: false }] };
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'reviewer_key_rotation_invalid' });
});

test('revoked artifacts must remain revoked in later versions', async () => {
  payload.revokedArtifactIds = ['revoked-test-artifact'];
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  const previous = stored;
  payload.version++;
  payload.revokedArtifactIds = [];
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'revocation_history_rollback' });
  expect(stored).toBe(previous);
});

test('offline, storage failures and missing revocation metadata never authorize from cache', async () => {
  expect((await loadReleaseAuthorization()).kind).toBe('verified');
  (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'fresh_authorization_unavailable' });
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'fresh_authorization_unavailable' });
  delete (payload as Partial<ReleaseTrustPayload>).revokedArtifactIds;
  expect(await loadReleaseAuthorization()).toMatchObject({ code: 'revocation_or_enrollment_missing' });
});
