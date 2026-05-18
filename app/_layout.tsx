import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { registerForPushNotifications } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setSession, setProfile, setLoading, isLoading } = useAuthStore();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
        router.replace('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    setProfile(data);
    setLoading(false);

    // Register for push notifications (no-ops on simulator / if denied)
    if (data?.id) {
      registerForPushNotifications(data.id).catch(() => {});
    }

    // OAuth users land here before completing their profile
    if (!data?.phone || !data?.pickup_address) {
      router.replace('/auth/oauth-confirm');
    } else if (data.role === 'runner') {
      router.replace('/(runner)');
    } else if (data.role === 'admin') {
      router.replace('/(admin)');
    } else {
      router.replace('/(customer)/home');
    }
  }

  // Keep splash visible until both fonts and auth state are resolved to prevent flash
  useEffect(() => {
    if (fontsLoaded && !isLoading) SplashScreen.hideAsync();
  }, [fontsLoaded, isLoading]);

  if (!fontsLoaded || isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(runner)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}
