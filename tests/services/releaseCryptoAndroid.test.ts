import { releaseSha256,verifyReleaseSignature,releaseNonce } from '@/services/security/releaseCrypto';
import { requireOptionalNativeModule } from 'expo';
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('expo',()=>({requireOptionalNativeModule:jest.fn()}));
test('Android dispatches to native module, not Web Crypto or JS crypto',async()=>{
  const native={sha256:jest.fn(async()=> 'digest'),verifyRsaPss:jest.fn(async()=>true),nonce:jest.fn(async()=> 'nonce')};
  (requireOptionalNativeModule as jest.Mock).mockReturnValue(native);
  expect(await releaseSha256('abc')).toBe('digest');
  expect(await verifyReleaseSignature('spki','payload','sig')).toBe(true);
  expect(native.verifyRsaPss).toHaveBeenCalledWith('spki','payload','sig');
  expect(await releaseNonce()).toBe('nonce');
});
test('missing native module or provider error fails closed, with no JS fallback',async()=>{
  (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);
  await expect(releaseSha256('abc')).rejects.toThrow('cryptographic_verifier_unavailable');
  (requireOptionalNativeModule as jest.Mock).mockReturnValue({verifyRsaPss:async()=>{throw new Error('provider unavailable');}});
  await expect(verifyReleaseSignature('key','payload','sig')).rejects.toThrow('provider unavailable');
});
