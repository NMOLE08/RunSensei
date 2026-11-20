import { isInternalGpsDiagnosticsEnabled } from '@/config/internalGpsDiagnostics';

describe('internal GPS diagnostic build gate', () => {
  it('requires both the embedded internal-build marker and explicit public opt-in', () => {
    expect(isInternalGpsDiagnosticsEnabled({ internalBuild: false, publicOptIn: 'true' })).toBe(false);
    expect(isInternalGpsDiagnosticsEnabled({ internalBuild: true, publicOptIn: undefined })).toBe(false);
    expect(isInternalGpsDiagnosticsEnabled({ internalBuild: true, publicOptIn: 'false' })).toBe(false);
    expect(isInternalGpsDiagnosticsEnabled({ internalBuild: true, publicOptIn: 'true' })).toBe(true);
  });
});
