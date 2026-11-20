import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Field, PageHeader, Screen } from '@/design/components';
import { colors } from '@/design/tokens';
import { getLocalAccount, saveLocalAccount } from '@/application/localAccount';
import { supabase } from '@/services/auth/supabase';
import { updateRemoteDisplayName } from '@/services/account/onboardingProgress';

const formatDate = (value: string) => { const digits = value.replace(/\D/g, '').slice(0, 8); return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-'); };

export default function ProfileScreen() {
  const [id, setId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [calendar, setCalendar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(async ({ data }) => { const accountId = data.user?.id; if (!accountId) return; const saved = await getLocalAccount(accountId); setId(accountId); setEmail(data.user?.email ?? saved?.email ?? ''); setName(saved?.displayName ?? (typeof data.user?.user_metadata?.full_name === 'string' ? data.user.user_metadata.full_name : '')); setPhone(saved?.phone ?? ''); setDob(saved?.dateOfBirth ?? ''); }); }, []);
  const save = async () => { if (!id) return setMessage('Sign in before saving a profile.'); await updateRemoteDisplayName(name); await saveLocalAccount({ id, email, displayName: name || null, phone: phone || null, dateOfBirth: dob || null }); setMessage('Profile name saved to your account. Phone number and date of birth remain only on this device.'); };
  return <Screen>
    <PageHeader eyebrow="YOUR ACCOUNT" title="Profile" description="Keep your details current and your account recognizable." />
    <Card tone="soft"><AppText variant="section">Personal details</AppText><Field autoComplete="name" label="Name" onChangeText={setName} value={name} /><Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} /><Field autoComplete="tel" keyboardType="phone-pad" label="Phone number" onChangeText={setPhone} value={phone} /><Field keyboardType="number-pad" label="Date of birth" onChangeText={(value) => setDob(formatDate(value))} placeholder="YYYY-MM-DD" value={dob} /><AppText variant="meta">TYPE YYYYMMDD OR CHOOSE A DATE</AppText><Button label="Choose date" onPress={() => setCalendar(true)} tone="secondary" />{calendar && <DateTimePicker value={/^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T12:00:00`) : new Date()} mode="date" onChange={(_, value) => { setCalendar(false); if (value) setDob(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`); }} />}</Card>
    <Button label="Save changes" tone="accent" onPress={() => { void save(); }} />
    {message && <Card style={styles.message}><AppText accessibilityLiveRegion="polite">{message}</AppText></Card>}
  </Screen>;
}
const styles = StyleSheet.create({ message: { backgroundColor: colors.successWash, borderColor: colors.success } });
