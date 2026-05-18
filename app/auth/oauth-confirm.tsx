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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

export default function OAuthConfirm() {
  const { session, profile } = useAuthStore();

  const meta = session?.user?.user_metadata ?? {};
  const derivedFirstName =
    profile?.first_name ??
    meta.first_name ??
    meta.given_name ??
    (meta.full_name as string | undefined)?.split(' ')[0] ??
    '';
  const derivedLastName =
    profile?.last_name ??
    meta.last_name ??
    meta.family_name ??
    (meta.full_name as string | undefined)?.split(' ').slice(1).join(' ') ??
    '';

  const [firstName, setFirstName] = useState(derivedFirstName);
  const [lastName, setLastName] = useState(derivedLastName);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [pickupAddress, setPickupAddress] = useState(profile?.pickup_address ?? '');
  const [isLoading, setIsLoading] = useState(false);

  const displayEmail = profile?.email ?? session?.user?.email ?? '';

  function validate() {
    if (!firstName.trim()) return 'First name is required.';
    if (!lastName.trim()) return 'Last name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!pickupAddress.trim()) return 'Home pickup address is required.';
    return null;
  }

  async function handleComplete() {
    const error = validate();
    if (error) {
      Alert.alert('Missing info', error);
      return;
    }

    if (!session?.user?.id) {
      Alert.alert('Error', 'Session expired. Please sign in again.');
      router.replace('/auth');
      return;
    }

    setIsLoading(true);
    try {
      const { error: upsertError } = await supabase.from('users').upsert({
        id: session.user.id,
        role: 'customer',
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: displayEmail,
        phone: phone.trim(),
        pickup_address: pickupAddress.trim(),
      });

      if (upsertError) throw upsertError;
      router.replace('/(customer)');
    } catch (err: any) {
      Alert.alert('Setup failed', err.message ?? 'Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>
              We need a few more details to complete your account.
            </Text>
          </View>

          {/* Read-only email chip */}
          {displayEmail ? (
            <View style={styles.emailChip}>
              <Text style={styles.emailChipLabel}>Signed in as</Text>
              <Text style={styles.emailChipValue} numberOfLines={1}>
                {displayEmail}
              </Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {/* Name row */}
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Jane"
                  placeholderTextColor={Colors.textSecondary}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  autoComplete="given-name"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Smith"
                  placeholderTextColor={Colors.textSecondary}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  autoComplete="family-name"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 555-5555"
                placeholderTextColor={Colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Home pickup address</Text>
              <TextInput
                style={styles.input}
                placeholder="123 Main St, City, State, ZIP"
                placeholderTextColor={Colors.textSecondary}
                value={pickupAddress}
                onChangeText={setPickupAddress}
                autoCapitalize="words"
                autoComplete="street-address"
                returnKeyType="done"
                onSubmitEditing={handleComplete}
              />
              <Text style={styles.hint}>
                Used as your default package pickup location.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleComplete}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>Complete Setup</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.terms}>
            By continuing you agree to our Terms of Service and Privacy Policy.
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },

  // Header
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Email chip
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  emailChipLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  emailChipValue: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },

  // Form
  form: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfField: {
    flex: 1,
    gap: 6,
  },
  field: {
    gap: 6,
  },
  label: {
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
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },

  // Submit
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: Colors.surface,
  },

  // Footer
  terms: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
