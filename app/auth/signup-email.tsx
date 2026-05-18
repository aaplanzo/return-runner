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
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import { PhoneInput } from '@/components/PhoneInput';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';

export default function SignupEmail() {
  const { email: prefillEmail } = useLocalSearchParams<{ email: string }>();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [phone, setPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<number | undefined>();
  const [pickupLng, setPickupLng] = useState<number | undefined>();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function validate() {
    if (!firstName.trim()) return 'First name is required.';
    if (!lastName.trim()) return 'Last name is required.';
    if (!email.trim() || !email.includes('@')) return 'A valid email is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!pickupAddress.trim()) return 'Home pickup address is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    return null;
  }

  async function handleSignUp() {
    const error = validate();
    if (error) {
      Alert.alert('Missing info', error);
      return;
    }

    setIsLoading(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role: 'customer',
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Signup failed — no user returned.');

      // Upsert public.users row (trigger also fires, upsert is idempotent)
      const { error: profileError } = await supabase.from('users').upsert({
        id: authData.user.id,
        role: 'customer',
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        pickup_address: pickupAddress.trim(),
        pickup_lat: pickupLat ?? null,
        pickup_lng: pickupLng ?? null,
      });

      if (profileError) throw profileError;
      // Redirect handled by onAuthStateChange in _layout.tsx
    } catch (err: any) {
      Alert.alert('Sign up failed', err.message ?? 'Please try again.');
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
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            We'll use your address as the default pickup location.
          </Text>

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
              <Text style={styles.label}>Email</Text>
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
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <PhoneInput
                style={styles.input}
                placeholder="(555) 555-5555"
                placeholderTextColor={Colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                returnKeyType="next"
              />
            </View>

            <AddressAutocomplete
              label="Home pickup address"
              placeholder="123 Main St, City, State, ZIP"
              onSelect={(address, lat, lng) => {
                setPickupAddress(address);
                setPickupLat(lat);
                setPickupLng(lng);
              }}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 8 characters"
                placeholderTextColor={Colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSignUp}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>Create Account</Text>
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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  // Navigation
  back: { marginBottom: Spacing.lg },
  backText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    color: Colors.primary,
  },

  // Header
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 26,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 20,
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
