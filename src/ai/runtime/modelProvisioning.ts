import * as Network from 'expo-network';
import { localModelManager } from './localModel';

export type ProvisioningNetwork = 'wifi' | 'cellular' | 'offline' | 'other';
export type ProvisioningStart = { started: true } | { started: false; reason: 'mobile_approval_required' | 'network_unavailable' };

export async function currentProvisioningNetwork(): Promise<ProvisioningNetwork> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || state.isInternetReachable === false) return 'offline';
  if (state.type === Network.NetworkStateType.WIFI) return 'wifi';
  if (state.type === Network.NetworkStateType.CELLULAR) return 'cellular';
  return 'other';
}

export async function provisionLocalModel(options: { allowMetered: boolean }): Promise<ProvisioningStart> {
  const network = await currentProvisioningNetwork();
  if (network === 'offline') return { started: false, reason: 'network_unavailable' };
  if ((network === 'cellular' || network === 'other') && !options.allowMetered) return { started: false, reason: 'mobile_approval_required' };
  await localModelManager.provision();
  return { started: true };
}
