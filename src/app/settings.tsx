import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, PageHeader, Screen, SectionHeader } from '@/design/components';
import { deleteLocalData, exportLocalData } from '@/application/dataControls';
import { expoLocalNotifications } from '@/services/reminders/expoNotifications';
import { getRemindersEnabled, setRemindersEnabled } from '@/application/reminderRefresh';
import { checkpointLabels, loadWorkoutCheckpoints, subscribeWorkoutCheckpoints, type WorkoutCheckpoint } from '@/application/workoutDiagnostics';
import { localAiEnabled } from '@/config/productMode';
import { router, type Href } from 'expo-router';
import { colors, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { requestAccountDeletion } from '@/services/account/deleteAccount';
import { developerTrainingLabEnabled } from '@/config/developerTrainingLab';
import { internalGpsDiagnosticsEnabled } from '@/config/internalGpsDiagnostics';
import { exportGpsDiagnostics, gpsDiagnosticsEnabled, setGpsDiagnosticsEnabled } from '@/application/gpsDiagnostics';
import { loadLatestTrackerSnapshot } from '@/application/workoutTracker';
import { TORTO_NAME } from '@/config/productIdentity';

export default function SettingsScreen() {
  const [status, setStatus] = useState<string | null>(null);
  const [remindersEnabled, setReminderState] = useState(false);
  const [checkpoints, setCheckpoints] = useState<WorkoutCheckpoint[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [gpsDiagnosticsOn, setGpsDiagnosticsOn] = useState(false);
  const auth = useAuth();
  useEffect(() => { void getRemindersEnabled().then(setReminderState).catch(() => setStatus('Reminder preference could not be read.')); }, []);
  useEffect(() => { const unsubscribe = subscribeWorkoutCheckpoints(setCheckpoints); void loadWorkoutCheckpoints().then(setCheckpoints).catch(() => setStatus('Tracker checkpoints could not be read.')); return unsubscribe; }, []);
  useEffect(() => { if (internalGpsDiagnosticsEnabled) void gpsDiagnosticsEnabled().then(setGpsDiagnosticsOn).catch(() => setStatus('GPS diagnostic setting could not be read.')); }, []);
  const toggleReminders = async () => { const next = !remindersEnabled; try { const result = await setRemindersEnabled(next); if (result.permissionDenied) { setReminderState(false); await setRemindersEnabled(false); setStatus('Notification permission was denied. Planning still works normally.'); } else { setReminderState(next); setStatus(next ? 'Local reminders are enabled.' : 'Local reminders are disabled and app-owned scheduled reminders were cancelled.'); } } catch { setStatus('Reminder settings could not be updated. Your plan was not changed.'); } };
  const exportData = async () => { try { const payload = await exportLocalData(); setStatus(`Export prepared locally (${payload.length} characters). Copy/save delivery is device-specific and not automatic.`); } catch { setStatus('Export could not be prepared. Your local data was not changed.'); } };
  const toggleGpsDiagnostics = async () => { const next = !gpsDiagnosticsOn; try { await setGpsDiagnosticsEnabled(next); setGpsDiagnosticsOn(next); setStatus(next ? 'GPS diagnostics are enabled for future samples on this phone. Coordinates are excluded.' : 'GPS diagnostics are disabled. Existing local diagnostic exports remain unchanged.'); } catch { setStatus('GPS diagnostics could not be updated. Recording was not changed.'); } };
  const exportGps = async () => { try { if (!auth.user) { setStatus('Sign in before exporting GPS diagnostics.'); return; } const snapshot = await loadLatestTrackerSnapshot(auth.user.id); if (!snapshot) { setStatus('Record a workout before exporting GPS diagnostics.'); return; } const uri = await exportGpsDiagnostics(snapshot.session.ownerId, snapshot.session.id, snapshot.session.metricVersion); setStatus(`GPS diagnostics exported locally: ${uri}`); } catch { setStatus('GPS diagnostic export could not be prepared. Recording was not changed.'); } };
  const clearData = async () => { try { await deleteLocalData(expoLocalNotifications); setStatus('This account’s local records and app-owned reminders were deleted from this phone.'); } catch { setStatus('Deletion could not complete. Existing data was left in place where possible.'); } };
  const confirmClear = () => Alert.alert('Delete local account data?', 'This removes this account’s local records and app-owned reminders from this phone. It does not delete the Google account.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void clearData(); } }]);
  const confirmDeleteAccount = () => Alert.alert(`Delete ${TORTO_NAME} account?`, `This permanently deletes your ${TORTO_NAME} account and cloud onboarding data. Local data should be deleted separately. This cannot be undone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => { void requestAccountDeletion().then(() => auth.signOut()).catch(() => setStatus('Account deletion could not be completed. Please try again.')); } }]);
  return (
    <Screen>
      <PageHeader eyebrow={TORTO_NAME.toUpperCase()} title="Settings" description="Your account, preferences, and local data." />
      <SectionHeader title="Account" detail="GOOGLE" />
      <Card tone="soft"><AppText style={styles.description}>{auth.user?.email ?? 'Signed in'}</AppText><Button label="Profile" tone="secondary" onPress={() => router.push('/profile' as Href)} /><Button label="Sign out" tone="quiet" onPress={() => { void auth.signOut().catch(() => setStatus('Sign-out could not finish. Please try again.')); }} /><Button label={`Delete ${TORTO_NAME} account`} tone="quiet" onPress={confirmDeleteAccount} /></Card>
      <Card><View style={styles.cardHeading}><AppText variant="title">Connected apps</AppText><AppText variant="meta">OPTIONAL</AppText></View><AppText style={styles.description}>Connect services when available. Local tracking continues without them.</AppText><Button label="Strava connection" tone="secondary" onPress={() => router.push('/integrations/strava' as Href)} /></Card>
      <Card><View style={styles.cardHeading}><AppText variant="title">On-device AI</AppText><AppText variant="meta">OPTIONAL</AppText></View><AppText style={styles.description}>{localAiEnabled ? 'The model works offline after setup. GPS tracking does not depend on it.' : 'AI is turned off in this build. GPS tracking is available as usual.'}</AppText>{localAiEnabled && <Button label="Manage local model" tone="secondary" onPress={() => router.push('/ai/model' as Href)} />}</Card>
      <Card><View style={styles.cardHeading}><AppText variant="title">Reminders</AppText><AppText variant="meta">{remindersEnabled ? 'ON' : 'OFF'}</AppText></View><AppText style={styles.description}>Optional local reminders. Delivery is not guaranteed.</AppText><Button label={remindersEnabled ? 'Turn reminders off' : 'Turn reminders on'} onPress={() => { void toggleReminders(); }} tone="secondary" /><AppText variant="meta">Requires a development or release build.</AppText></Card>
      <Card><View style={styles.cardHeading}><AppText variant="title">Local data</AppText><AppText variant="meta">ON THIS PHONE</AppText></View><AppText style={styles.description}>Your export separates workout prescriptions from recorded activity. Nothing is uploaded.</AppText><Button label="Prepare JSON export" onPress={exportData} tone="secondary" /><Button label="Delete local account data" onPress={confirmClear} tone="secondary" accessibilityHint="Deletes only this signed-in account’s local data." /></Card>
      {developerTrainingLabEnabled && <Card><View style={styles.cardHeading}><AppText variant="title">Developer tools</AppText><AppText variant="meta">DEVELOPMENT ONLY</AppText></View><AppText style={styles.description}>Internal audio and research experiments. These tools do not write training plans or user records.</AppText><Button label="Open Talking Jett Lab" tone="secondary" onPress={() => router.push('/developer/talking-jett-lab' as Href)} /></Card>}
      {internalGpsDiagnosticsEnabled && <Card><View style={styles.cardHeading}><AppText variant="title">GPS diagnostics</AppText><AppText variant="meta">INTERNAL BUILD</AppText></View><AppText style={styles.description}>Opt-in, local diagnostic evidence for measured GPS field tests. Coordinates are excluded.</AppText><Button label={gpsDiagnosticsOn ? 'Turn GPS diagnostics off' : 'Turn GPS diagnostics on'} tone="secondary" onPress={() => { void toggleGpsDiagnostics(); }} /><Button label="Export current GPS diagnostics" tone="secondary" onPress={() => { void exportGps(); }} /></Card>}
      <Card style={styles.diagnosticsCard}><Pressable accessibilityRole="button" accessibilityState={{ expanded: showCheckpoints }} onPress={() => setShowCheckpoints((value) => !value)} style={styles.disclosure}><View style={styles.disclosureCopy}><AppText variant="title">Workout diagnostics</AppText><AppText style={styles.description}>Private technical checkpoints. Location coordinates are not shown.</AppText></View><AppText variant="label">{showCheckpoints ? '−' : '+'}</AppText></Pressable>{showCheckpoints && (checkpoints.length === 0 ? <AppText>No checkpoints yet. Start a run or walk to see them here.</AppText> : [...checkpoints].reverse().map((item, index) => <AppText key={`${item.time}-${index}`} variant="meta">{new Date(item.time).toLocaleString()} · {checkpointLabels[item.code]}</AppText>))}</Card>
      {status && <Card><AppText accessibilityLiveRegion="polite">{status}</AppText></Card>}
    </Screen>
  );
}

const styles = StyleSheet.create({ pageHeading: { gap: spacing.xs, paddingBottom: spacing.xs }, subtitle: { color: colors.mutedInk }, cardHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, description: { color: colors.mutedInk, fontSize: 14, lineHeight: 21 }, diagnosticsCard: { padding: spacing.md }, disclosure: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }, disclosureCopy: { flex: 1, gap: spacing.xs } });
