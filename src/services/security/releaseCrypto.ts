import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type NativeReleaseCrypto = {
  sha256(content: string): Promise<string>;
  verifyRsaPss(spkiHex: string, payload: string, signatureHex: string): Promise<boolean>;
  nonce(): Promise<string>;
};
function native(): NativeReleaseCrypto {
  const module = requireOptionalNativeModule<NativeReleaseCrypto>('TortoReleaseCrypto');
  if (!module) throw new Error('cryptographic_verifier_unavailable');
  return module;
}
function bytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) throw new Error('invalid_hex');
  return Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair,16));
}
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2,'0')).join('');
function subtle() {
  if (!globalThis.crypto?.subtle) throw new Error('cryptographic_verifier_unavailable');
  return crypto.subtle;
}
export async function releaseSha256(content: string): Promise<string> {
  if (Platform.OS === 'android') return native().sha256(content);
  return hex(await subtle().digest('SHA-256',new TextEncoder().encode(content)));
}
export async function verifyReleaseSignature(spkiHex: string, payload: string, signatureHex: string): Promise<boolean> {
  if (Platform.OS === 'android') return native().verifyRsaPss(spkiHex,payload,signatureHex);
  const api=subtle();
  const key=await api.importKey('spki',bytes(spkiHex),{name:'RSA-PSS',hash:'SHA-256'},false,['verify']);
  if ((key.algorithm as RsaHashedKeyAlgorithm).modulusLength < 2048) throw new Error('rsa_key_too_short');
  return api.verify({name:'RSA-PSS',saltLength:32},key,bytes(signatureHex),new TextEncoder().encode(payload));
}
export async function releaseNonce(): Promise<string> {
  if (Platform.OS === 'android') return native().nonce();
  subtle();
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}
