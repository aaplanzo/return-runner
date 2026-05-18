import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

export default function AdminHome() {
  const { profile } = useAuthStore();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {profile?.first_name ? `Hi, ${profile.first_name}` : 'Admin Dashboard'}
        </Text>
        <Text style={styles.subtitle}>Phase 2 — coming soon</Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FontFamily.bold, fontSize: 24, color: Colors.textPrimary },
  subtitle: { fontFamily: FontFamily.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 8 },
  footer: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  signOutButton: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
