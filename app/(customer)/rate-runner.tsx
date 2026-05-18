import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type TipOption = 'none' | '1' | '3' | '5' | 'other';

const TIP_OPTIONS: { label: string; value: TipOption }[] = [
  { label: 'No tip',  value: 'none'  },
  { label: '$1',      value: '1'     },
  { label: '$3',      value: '3'     },
  { label: '$5',      value: '5'     },
  { label: 'Other',   value: 'other' },
];

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function RateRunner() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { jobId, runnerId } = useLocalSearchParams<{ jobId: string; runnerId: string }>();

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;

  const [runner, setRunner] = useState<UserRow | null>(null);
  const [stars, setStars] = useState(0);
  const [tipOption, setTipOption] = useState<TipOption>('none');
  const [customTip, setCustomTip] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 5 }),
    ]).start();

    if (runnerId) {
      supabase.from('users').select('*').eq('id', runnerId).single()
        .then(({ data }) => setRunner(data ?? null));
    }
  }, []);

  function getTipAmount(): number {
    if (tipOption === 'none') return 0;
    if (tipOption === 'other') {
      const v = parseFloat(customTip);
      return isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
    }
    return parseFloat(tipOption);
  }

  async function handleSubmit() {
    if (stars === 0) {
      Alert.alert('Rate your runner', 'Please tap a star before submitting.');
      return;
    }
    if (!profile?.id || !jobId || !runnerId) return;
    setIsSubmitting(true);

    try {
      // 1. Insert rating row
      const { error: ratingError } = await supabase.from('ratings').insert({
        job_id: jobId,
        rater_id: profile.id,
        ratee_id: runnerId,
        stars,
      });
      if (ratingError) throw ratingError;

      // 2. Recalculate runner's rolling average
      const { data: runnerData } = await supabase
        .from('users')
        .select('rating_avg, rating_count')
        .eq('id', runnerId)
        .single();

      if (runnerData) {
        const oldCount = runnerData.rating_count ?? 0;
        const oldAvg   = runnerData.rating_avg ?? 0;
        const newCount = oldCount + 1;
        const newAvg   = parseFloat(((oldAvg * oldCount + stars) / newCount).toFixed(2));
        await supabase
          .from('users')
          .update({ rating_avg: newAvg, rating_count: newCount })
          .eq('id', runnerId);
      }

      // 3. Persist tip (replaces any pre-set checkout tip with the customer's final decision)
      const tipAmount = getTipAmount();
      await supabase
        .from('jobs')
        .update({ tip_amount: tipAmount })
        .eq('id', jobId);

      router.replace('/(customer)/home');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not submit', msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  const runnerFirstName = runner?.first_name ?? 'Your runner';
  const runnerFullName  = runner
    ? `${runner.first_name ?? ''} ${runner.last_name ?? ''}`.trim() || 'Your Runner'
    : 'Your Runner';
  const tip = getTipAmount();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Celebration header ──────────────────────────── */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.headerEmoji}>🎉</Text>
          <Text style={styles.headerTitle}>Return complete!</Text>
          <Text style={styles.headerSub}>
            How did {runnerFirstName} do today?
          </Text>
        </Animated.View>

        {/* ── Runner info card ────────────────────────────── */}
        <Animated.View style={[styles.runnerCard, { opacity: fadeAnim }]}>
          <View style={styles.runnerAvatar}>
            <Text style={styles.runnerAvatarEmoji}>🏃</Text>
          </View>
          <View style={styles.runnerInfo}>
            <Text style={styles.runnerName}>{runnerFullName}</Text>
            <Text style={styles.runnerMeta}>Return Runner</Text>
          </View>
          {runner && runner.rating_count > 0 && (
            <View style={styles.runnerRatingBadge}>
              <Text style={styles.runnerRatingText}>★ {runner.rating_avg.toFixed(1)}</Text>
              <Text style={styles.runnerRatingCount}>{runner.rating_count} ratings</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Stars ──────────────────────────────────────── */}
        <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setStars(n)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                style={styles.starBtn}
              >
                <Text style={[styles.star, n <= stars && styles.starFilled]}>
                  {n <= stars ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {stars > 0 && (
            <Text style={styles.starLabel}>{STAR_LABELS[stars]}</Text>
          )}
        </Animated.View>

        {/* ── Tip ────────────────────────────────────────── */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionLabel}>ADD A TIP</Text>
          <View style={styles.tipChips}>
            {TIP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.tipChip, tipOption === opt.value && styles.tipChipActive]}
                onPress={() => setTipOption(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tipChipText, tipOption === opt.value && styles.tipChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tipOption === 'other' && (
            <View style={styles.customTipBox}>
              <Text style={styles.customTipDollar}>$</Text>
              <TextInput
                style={styles.customTipInput}
                value={customTip}
                onChangeText={setCustomTip}
                placeholder="0.00"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoFocus
              />
            </View>
          )}

          {tip > 0 && (
            <Text style={styles.tipNote}>
              100% of the ${tip.toFixed(2)} tip goes to {runnerFirstName} 🙌
            </Text>
          )}
        </Animated.View>

        {/* ── Actions ────────────────────────────────────── */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={[styles.submitBtn, stars === 0 && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || stars === 0}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {tip > 0
                  ? `Submit Rating + $${tip.toFixed(2)} Tip`
                  : 'Submit Rating'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(customer)/home')}
            activeOpacity={0.6}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.xl,
  },

  // Header
  header: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerEmoji: { fontSize: 52 },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerSub: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Runner card
  runnerCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  runnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF3FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  runnerAvatarEmoji: { fontSize: 26 },
  runnerInfo: { flex: 1, gap: 3 },
  runnerName: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
  },
  runnerMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  runnerRatingBadge: {
    alignItems: 'flex-end',
    gap: 2,
  },
  runnerRatingText: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    color: Colors.warning,
  },
  runnerRatingCount: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: Colors.textSecondary,
  },

  // Sections
  section: {
    gap: Spacing.md,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
  },

  // Stars
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  starBtn: {
    padding: 4,
  },
  star: {
    fontSize: 44,
    color: Colors.border,
    lineHeight: 50,
  },
  starFilled: {
    color: Colors.warning,
  },
  starLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  // Tip
  tipChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tipChip: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    backgroundColor: Colors.surface,
  },
  tipChipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF3FA',
  },
  tipChipText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tipChipTextActive: {
    color: Colors.primary,
  },
  customTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    backgroundColor: '#EEF3FA',
    gap: 4,
  },
  customTipDollar: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  customTipInput: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: 18,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  tipNote: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  // Actions
  actions: {
    gap: Spacing.md,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: Colors.border,
  },
  submitBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: '#fff',
    letterSpacing: 0.2,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  skipText: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
