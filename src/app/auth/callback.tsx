import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/design/components';
import { useAuth } from '@/features/auth/AuthProvider';

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const { retry } = useAuth();

  useEffect(() => {
    void retry().catch(() => setError('Sign-in could not be completed. Please try again.'));
  }, [retry]);

  return <Screen><Card><AppText variant="title">{error ? 'Sign-in needs attention' : 'Completing sign-in'}</AppText><AppText>{error ?? 'Please wait while we return you to the app.'}</AppText>{error && <Button label="Back to sign-in" onPress={() => router.replace('/auth')} />}</Card></Screen>;
}
