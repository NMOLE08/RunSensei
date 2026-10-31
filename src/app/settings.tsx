import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, Screen } from '@/design/components';
import { deleteLocalData, exportLocalData } from '@/application/dataControls';
import { expoLocalNotifications } from '@/services/reminders/expoNotifications';
import { getRemindersEnabled, setRemindersEnabled } from '@/application/reminderRefresh';
import { checkpointLabels, loadWorkoutCheckpoints, subscribeWorkoutCheckpoints, type WorkoutCheckpoint } from '@/application/workoutDiagnostics';
import { localAiEnabled, trackerOnly } from '@/config/productMode';
import { deleteAllGuestTrackerData, exportGuestTrackerData } from '@/application/trackerHistory';
import { router, type Href } from 'expo-router';

export default function SettingsScreen() {
  const [status, setStatus] = useState<string | null>(null);
  const [remindersEnabled, setReminderState] = useState(false);
  const [checkpoints, setCheckpoints] = useState<WorkoutCheckpoint[]>([]);
  useEffect(() => { if (!trackerOnly) void getRemindersEnabled().then(setReminderState).catch(() => setStatus('Reminder preference could not be read.')); }, []);
  useEffect(() => { const unsubscribe = subscribeWorkoutCheckpoints(setCheckpoints); void loadWorkoutCheckpoints().then(setCheckpoints).catch(() => setStatus('Tracker checkpoints could not be read.')); return unsubscribe; }, []);
  const toggleReminders = async () => { const next = !remindersEnabled; try { const result = await setRemindersEnabled(next); if (result.permissionDenied) { setReminderState(false); await setRemindersEnabled(false); setStatus('Notification permission was denied. Planning still works normally.'); } else { setReminderState(next); setStatus(next ? 'Local reminders are enabled.' : 'Local reminders are disabled and app-owned scheduled reminders were cancelled.'); } } catch { setStatus('Reminder settings could not be updated. Your plan was not changed.'); } };
  const exportData = async () => { try { const payload = trackerOnly ? await exportGuestTrackerData() : await exportLocalData(); setStatus(`Export prepared locally (${payload.length} characters). Copy/save delivery is device-specific and not automatic.`); } catch { setStatus('Export could not be prepared. Your local data was not changed.'); } };
  const clearData = async () => { try { if (trackerOnly) await deleteAllGuestTrackerData(); else await deleteLocalData(expoLocalNotifications); setStatus(trackerOnly ? 'Local guest activities were deleted. Existing account data was not changed.' : 'Local planner data and app-owned reminders were deleted.'); } catch { setStatus('Deletion could not complete. Existing data was left in place where possible.'); } };
  const confirmClear = () => Alert.alert(trackerOnly ? 'Delete local activities?' : 'Delete local planner data?', trackerOnly ? 'This removes guest tracker sessions and route data from this phone. Existing account-owned records remain separate.' : 'This removes local planner records and app-owned reminders.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void clearData(); } }]);
  return (
    <Screen>
      <AppText variant="meta">SETTINGS / LOCAL DATA</AppText>
      <AppText variant="title">Preferences</AppText>
      <Card><AppText variant="title">Connected apps</AppText><AppText>Optional integrations never block local tracking. Strava activity import and personalization remain disabled pending policy authorization.</AppText><Button label="Strava connection" tone="secondary" onPress={() => router.push('/integrations/strava' as Href)} /></Card>
      <Card><AppText variant="title">Run Sensei on this phone</AppText><AppText>{localAiEnabled ? 'The optional local model runs offline after a one-time download. GPS tracking works without it.' : 'Local AI is disabled in this build. GPS tracking still works normally.'}</AppText>{localAiEnabled && <Button label="Manage local AI model" tone="secondary" onPress={() => router.push('/ai/model' as Href)} />}</Card>
      {!trackerOnly && <Card><AppText variant="title">Reminders</AppText><AppText>Local reminders are opt-in and are suppressed immediately when a plan needs review or is on health hold. Delivery is not guaranteed.</AppText><Button label={remindersEnabled ? 'Disable reminders' : 'Enable reminders'} onPress={() => { void toggleReminders(); }} tone="secondary" /><AppText variant="meta">A development or release build is required for reliable Expo notification testing; Expo Go limitations apply.</AppText></Card>}
      <Card><AppText variant="title">Your local data</AppText><AppText>{trackerOnly ? 'Run and walk recordings stay in the guest tracker area on this phone. Existing signed-in account records remain separate.' : 'Export contains separate prescriptions, activity facts, resolutions, revisions, and reminder records. It does not upload data.'}</AppText><Button label="Prepare JSON export" onPress={exportData} tone="secondary" /><Button label={trackerOnly ? 'Delete local activities' : 'Delete local planner data'} onPress={confirmClear} tone="secondary" accessibilityHint="Deletes only the local data described above." /></Card>
      <Card><AppText variant="title">Tracker checkpoints</AppText><AppText>Only events from the current tracker diagnostic store appear here. It records lifecycle stages and the first filtering event of each kind, never coordinates.</AppText>{checkpoints.length === 0 ? <AppText>No tracker checkpoints yet. Start a new run or walk to create them.</AppText> : [...checkpoints].reverse().map((item, index) => <AppText key={`${item.time}-${index}`}>{new Date(item.time).toLocaleString()} — {checkpointLabels[item.code]}</AppText>)}</Card>
      {status && <Card><AppText accessibilityLiveRegion="polite">{status}</AppText></Card>}
    </Screen>
  );
}
