import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

WebBrowser.maybeCompleteAuthSession();

export default function AuthLanding() {
  const [email, setEmail] = useState('');
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider);
    try {
      const redirectTo = makeRedirectUri({ scheme: 'returnrunner' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error('OAuth unavailable');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        await supabase.auth.exchangeCodeForSession(result.url);
      }
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message ?? 'Please try again.');
    } finally {
      setOauthLoading(null);
    }
  }

  function handleAmazon() {
    Alert.alert(
      'Amazon Sign-In',
      'Amazon integration is coming soon. Use another sign-in method to get started.',
      [{ text: 'Got it' }],
    );
  }

  function handleContinueWithEmail() {
    if (!email.trim()) return;
    router.push({ pathname: '/auth/signup-email', params: { email: email.trim() } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Wordmark */}
          <View style={styles.header}>
            <Text style={styles.wordmark}>Return Runner</Text>
            <Text style={styles.tagline}>Package returns, picked up for you.</Text>
          </View>

          {/* OAuth buttons */}
          <View style={styles.oauthSection}>
            {/* Amazon — primary CTA */}
            <TouchableOpacity
              style={styles.amazonButton}
              onPress={handleAmazon}
              activeOpacity={0.85}
            >
              <Text style={styles.amazonButtonText}>Continue with Amazon</Text>
            </TouchableOpacity>
            <Text style={styles.amazonNote}>
              Amazon sign-in unlocks automatic order import
            </Text>

            {/* Google */}
            <TouchableOpacity
              style={[styles.outlineButton, oauthLoading !== null && styles.buttonDisabled]}
              onPress={() => handleOAuth('google')}
              activeOpacity={0.7}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === 'google' ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <Text style={styles.outlineButtonText}>Continue with Google</Text>
              )}
            </TouchableOpacity>

            {/* Apple */}
            <TouchableOpacity
              style={[styles.outlineButton, oauthLoading !== null && styles.buttonDisabled]}
              onPress={() => handleOAuth('apple')}
              activeOpacity={0.7}
              disabled={oauthLoading !== null}
            >
              {oauthLoading === 'apple' ? (
                <ActivityIndicator color={Colors.textPrimary} size="small" />
              ) : (
                <Text style={styles.outlineButtonText}>Continue with Apple</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email section */}
          <View style={styles.emailSection}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleContinueWithEmail}
            />
            <TouchableOpacity
              style={[styles.continueButton, !email.trim() && styles.continueButtonDisabled]}
              onPress={handleContinueWithEmail}
              activeOpacity={0.85}
              disabled={!email.trim()}
            >
              <Text style={styles.continueButtonText}>Continue with Email</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Already have an account?{' '}
            <Text style={styles.footerLink} onPress={() => router.push('/auth/login')}>
              Log in
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  wordmark: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  // OAuth
  oauthSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  amazonButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  amazonButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.surface,
  },
  amazonNote: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -Spacing.xs,
    marginBottom: Spacing.xs,
  },
  outlineButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // Email
  emailSection: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 15,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.surface,
  },

  // Footer
  footer: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  footerLink: {
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
});
