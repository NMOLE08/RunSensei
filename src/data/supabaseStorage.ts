import * as SecureStore from 'expo-secure-store';

const key = (value: string) => `runsensei.supabase.${value}`;

/**
 * Supabase's persisted refresh token is credential material. It belongs in the
 * platform keystore, never in the app's ordinary SQLite database.
 */
export const supabaseStorage = {
  getItem(itemKey: string): Promise<string | null> { return SecureStore.getItemAsync(key(itemKey)); },
  setItem(itemKey: string, value: string): Promise<void> { return SecureStore.setItemAsync(key(itemKey), value); },
  removeItem(itemKey: string): Promise<void> { return SecureStore.deleteItemAsync(key(itemKey)); },
};
