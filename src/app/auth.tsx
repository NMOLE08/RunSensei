import { useState } from 'react';
import { AppText, Button, Card, ContourDecoration, PageHeader, Screen } from '@/design/components';
import { signInWithGoogle } from '@/services/auth/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { AnimatedIcon } from '@/design/AnimatedIcon';
import { TORTO_NAME } from '@/config/productIdentity';
import { colors, spacing } from '@/design/tokens';
import { StyleSheet, View } from 'react-native';

export default function AuthScreen() {
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false); const auth = useAuth();
  const submit = async () => { if (busy) return; try { setBusy(true); setMessage(null); await signInWithGoogle(); await auth.retry(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Google sign-in could not be completed.'); } finally { setBusy(false); } };
  return <Screen>
    <View style={styles.hero}><ContourDecoration /><View style={styles.heroIcon}><AnimatedIcon name="walk" size={58} active /></View><PageHeader eyebrow={TORTO_NAME.toUpperCase()} title="Run your way." description="Your training, activity history, and progress—securely connected to you." /></View>
    <Card tone="soft"><AppText variant="section">One account. Every run.</AppText><AppText style={styles.copy}>Continue with Google to start fresh or pick up exactly where you left off.</AppText><Button label={busy ? 'Opening Google…' : 'Continue with Google'} tone="accent" onPress={() => { void submit(); }} /></Card>
    {message && <Card style={styles.message}><AppText accessibilityLiveRegion="polite">{message}</AppText></Card>}
    <AppText style={styles.helper}>{TORTO_NAME} requires a Google account. We never receive or store your Google password.</AppText>
  </Screen>;
}

const styles = StyleSheet.create({ hero: { backgroundColor: colors.butterWash, borderRadius: 32, gap: spacing.md, minHeight: 330, overflow: 'hidden', padding: spacing.lg, position: 'relative' }, heroIcon: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: 36, height: 72, justifyContent: 'center', width: 72 }, copy: { color: colors.mutedInk }, helper: { color: colors.mutedInk, fontSize: 13, lineHeight: 19, textAlign: 'center' }, message: { backgroundColor: colors.warningWash, borderColor: colors.warning } });
