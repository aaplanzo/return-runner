import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useJobStore } from '@/store/job';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

function EarningsRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={erStyles.row}>
      <Text style={[erStyles.label, bold && erStyles.labelBold]}>{label}</Text>
      <Text style={[erStyles.value, bold && erStyles.valueBold, accent && erStyles.valueAccent]}>
        {value}
      </Text>
    </View>
  );
}

const erStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  label: { fontFamily: FontFamily.regular, fontSize: 15, color: Colors.textSecondary },
  labelBold: { fontFamily: FontFamily.semiBold, color: Colors.textPrimary, fontSize: 16 },
  value: { fontFamily: FontFamily.semiBold, fontSize: 15, color: Colors.textPrimary },
  valueBold: { fontFamily: FontFamily.bold, fontSize: 22, letterSpacing: -0.5 },
  valueAccent: { color: Colors.primary },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function JobComplete() {
  const insets = useSafeAreaInsets();
  const { activeJob, packages, customerName, clear } = useJobStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 5 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
    ]).start();
  }, []);

  // Earnings breakdown
  const runnerPayout = activeJob?.runner_payout ?? 0;
  const tip = activeJob?.tip_amount ?? 0;
  const total = runnerPayout + tip;
  const baseFare = activeJob?.base_fare ?? 0;
  const distanceMiles = activeJob?.distance_miles ?? 0;
  const packageCount = activeJob?.package_count ?? packages.length ?? 1;
  const retailer = activeJob?.retailer ?? activeJob?.dropoff_type ?? 'Store';

  function handleBackToMap() {
    clear();
    router.replace('/(runner)/');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Celebration header ───────────────────────────── */}
        <Animated.View
          style={[
            styles.celebrationBox,
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Text style={styles.celebrationEmoji}>🎉</Text>
          <Text style={styles.celebrationTitle}>Return Complete!</Text>
          <Text style={styles.celebrationSub}>
            Great work{customerName ? ` — ${customerName}'s` : ". The customer's"} packages have been returned.
          </Text>
        </Animated.View>

        {/* ── Job summary chip row ─────────────────────────── */}
        <Animated.View
          style={[
            styles.chipRow,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.chip}>
            <Text style={styles.chipText}>📦 {packageCount} pkg{packageCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>🏪 {retailer}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>📍 {distanceMiles.toFixed(1)} mi</Text>
          </View>
        </Animated.View>

        {/* ── Earnings card ────────────────────────────────── */}
        <Animated.View
          style={[
            styles.earningsCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.cardLabel}>EARNINGS BREAKDOWN</Text>

          <View style={styles.dividerThin} />

          <EarningsRow
            label={`Base fare (75% of $${baseFare.toFixed(2)})`}
            value={fmt$(runnerPayout)}
          />
          <View style={styles.dividerThin} />
          <EarningsRow
            label="Tip"
            value={tip > 0 ? fmt$(tip) : 'No tip'}
          />
          <View style={styles.dividerBold} />
          <EarningsRow
            label="You earned"
            value={fmt$(total)}
            bold
            accent
          />
        </Animated.View>

        {/* ── Rating card ──────────────────────────────────── */}
        <Animated.View
          style={[
            styles.ratingCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.ratingRow}>
            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Text key={s} style={styles.starEmpty}>☆</Text>
              ))}
            </View>
            <Text style={styles.ratingNote}>Customer rating pending</Text>
          </View>
          <Text style={styles.ratingHint}>
            You'll be notified when {customerName ? customerName.split(' ')[0] : 'the customer'} rates this job.
          </Text>
        </Animated.View>

        {/* ── Streak / performance row ─────────────────────── */}
        <Animated.View
          style={[
            styles.perfRow,
            { opacity: fadeAnim },
          ]}
        >
          <View style={styles.perfChip}>
            <Text style={styles.perfChipEmoji}>⚡</Text>
            <Text style={styles.perfChipText}>On-time</Text>
          </View>
          <View style={styles.perfChip}>
            <Text style={styles.perfChipEmoji}>📸</Text>
            <Text style={styles.perfChipText}>Photo verified</Text>
          </View>
          <View style={styles.perfChip}>
            <Text style={styles.perfChipEmoji}>✓</Text>
            <Text style={styles.perfChipText}>All pkgs returned</Text>
          </View>
        </Animated.View>

        {/* ── Back to map ──────────────────────────────────── */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBackToMap}
          activeOpacity={0.85}
        >
          <Text style={styles.backBtnText}>Back to Map</Text>
        </TouchableOpacity>

        <Text style={styles.payoutNote}>
          Payout transfers to your bank within 2 business days via Stripe Connect.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'stretch',
    gap: Spacing.lg,
  },

  // Celebration header
  celebrationBox: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  celebrationEmoji: { fontSize: 56 },
  celebrationTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  celebrationSub: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },

  // Chip row
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // Earnings card
  earningsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  cardLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textSecondary,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dividerThin: { height: 1, backgroundColor: Colors.border, opacity: 0.6 },
  dividerBold: { height: 1.5, backgroundColor: Colors.border },

  // Rating card
  ratingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  ratingStars: { flexDirection: 'row', gap: 3 },
  starEmpty: { fontSize: 20, color: Colors.border },
  ratingNote: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  ratingHint: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  // Performance chips
  perfRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  perfChip: {
    flex: 1,
    backgroundColor: '#EDF7F1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${Colors.success}40`,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  perfChipEmoji: { fontSize: 18 },
  perfChipText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.success,
    textAlign: 'center',
  },

  // Back button
  backBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 18,
    alignItems: 'center',
  },
  backBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Payout note
  payoutNote: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
});
