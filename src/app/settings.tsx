import { useState } from 'react';
import { AppText, Button, Card, Screen } from '@/design/components';
import { deleteLocalData, exportLocalData } from '@/application/dataControls';
import { expoLocalNotifications } from '@/services/reminders/expoNotifications';

export default function SettingsScreen() {
  const [status, setStatus] = useState<string | null>(null);
  const exportData = async () => { try { const payload = await exportLocalData(); setStatus(`Export prepared locally (${payload.length} characters). Copy/save delivery is device-specific and not automatic.`); } catch { setStatus('Export could not be prepared. Your planner data was not changed.'); } };
  const clearData = async () => { try { await deleteLocalData(expoLocalNotifications); setStatus('Local planner data and app-owned reminders were deleted.'); } catch { setStatus('Deletion could not complete. Existing data was left in place where possible.'); } };
  return (
    <Screen>
      <AppText variant="meta">SETTINGS / LOCAL DATA</AppText>
      <AppText variant="title">Preferences</AppText>
      <Card><AppText variant="title">Reminders</AppText><AppText>Local reminders are opt-in and are suppressed immediately when a plan needs review or is on health hold. Delivery is not guaranteed.</AppText><AppText variant="meta">A development or release build is required for reliable Expo notification testing; Expo Go limitations apply.</AppText></Card>
      <Card><AppText variant="title">Your local data</AppText><AppText>Export contains separate prescriptions, activity facts, resolutions, revisions, and reminder records. It does not upload data.</AppText><Button label="Prepare JSON export" onPress={exportData} tone="secondary" /><Button label="Delete local planner data" onPress={clearData} tone="secondary" accessibilityHint="Deletes local planner records and cancels app-owned reminders." /></Card>
      {status && <Card><AppText accessibilityLiveRegion="polite">{status}</AppText></Card>}
    </Screen>
  );
}
