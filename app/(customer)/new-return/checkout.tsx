import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOCK_DISTANCE_MI = 3.2;
const PER_ITEM_FARE = 3.85;
const PER_MILE_FARE = 1.0;
const PLATFORM_RATE = 0.25;

// ─── Types ───────────────────────────────────────────────────────────────────

type CapturedItem = {
  id: string;
  itemName: string;
  dropoffType: string;
  orderId: string;
  qrData: string;
  photoUri: string | null;
};

type TipOption = '0' | '2' | '5' | '10' | 'custom';

const TIP_OPTIONS: { label: string; value: TipOption }[] = [
  { label: 'No tip', value: '0' },
  { label: '$2', value: '2' },
  { label: '$5', value: '5' },
  { label: '$10', value: '10' },
  { label: 'Custom', value: 'custom' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function PriceRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, bold && styles.priceLabelBold]}>{label}</Text>
      <Text style={[styles.priceValue, bold && styles.priceValueBold]}>{value}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function Checkout() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ items: string }>();

  const items: CapturedItem[] = params.items ? JSON.parse(params.items) : [];

  const packageFare = items.length * PER_ITEM_FARE;
  const distanceFare = Math.round(MOCK_DISTANCE_MI * PER_MILE_FARE * 100) / 100;
  const subtotal = Math.round((packageFare + distanceFare) * 100) / 100;

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [tipOption, setTipOption] = useState<TipOption>('0');
  const [customTipInput, setCustomTipInput] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);

  function getTipAmount(): number {
    if (tipOption === 'custom') {
      const v = parseFloat(customTipInput);
      return isNaN(v) || v < 0 ? 0 : Math.round(v * 100) / 100;
    }
    return parseFloat(tipOption);
  }

  const tip = getTipAmount();
  const total = Math.round((subtotal + tip) * 100) / 100;

  async function handlePlaceReturn() {
    if (!profile?.id) {
      Alert.alert('Error', 'You must be signed in to place a return.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one package to continue.');
      return;
    }

    setIsPlacing(true);

    try {
      const retailer      = [...new Set(items.map((i) => i.dropoffType))].join(', ');
      const baseFare      = subtotal;
      const platformCut   = Math.round(baseFare * PLATFORM_RATE * 100) / 100;
      const runnerPayout  = Math.round((baseFare - platformCut) * 100) / 100;
      const totalCents    = Math.round(total * 100);

      // ── Step 1: Create Stripe PaymentIntent via Edge Function ────────────
      const { data: intentData, error: intentError } = await supabase.functions.invoke(
        'create-payment-intent',
        {
          body: {
            amount_cents: totalCents,
            currency: 'usd',
            metadata: { customer_id: profile.id, item_count: String(items.length) },
          },
        },
      );

      if (intentError || !intentData?.clientSecret) {
        // Fall back gracefully — allow placing without payment in dev/test
        console.warn('PaymentIntent creation failed, proceeding without Stripe:', intentError);
      }

      // ── Step 2: Present PaymentSheet (only if we got a client secret) ────
      if (intentData?.clientSecret) {
        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: intentData.clientSecret,
          merchantDisplayName: 'Return Runner',
          style: 'automatic',
          defaultBillingDetails: {
            name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim(),
            email: profile.email ?? undefined,
          },
        });

        if (initError) throw new Error(initError.message);

        const { error: payError } = await presentPaymentSheet();

        if (payError) {
          // User cancelled or card declined — do not create the job
          if (payError.code !== 'Canceled') {
            Alert.alert('Payment failed', payError.message);
          }
          setIsPlacing(false);
          return;
        }
      }

      // ── Step 3: Persist job + packages to Supabase ───────────────────────
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          customer_id: profile.id,
          status: 'pending',
          retailer,
          package_count: items.length,
          dropoff_type: items[0]?.dropoffType ?? null,
          pickup_address: profile.pickup_address,
          pickup_lat: profile.pickup_lat,
          pickup_lng: profile.pickup_lng,
          distance_miles: MOCK_DISTANCE_MI,
          base_fare: baseFare,
          platform_cut: platformCut,
          runner_payout: runnerPayout,
          tip_amount: tip,
          stripe_payment_intent_id: intentData?.paymentIntentId ?? null,
        })
        .select('id')
        .single();

      if (jobError || !job) throw jobError ?? new Error('Job insert returned no data');

      const { error: pkgError } = await supabase.from('packages').insert(
        items.map((item, i) => ({
          job_id: job.id,
          item_name: item.itemName,
          qr_code_data: item.qrData || null,
          item_photo_path: item.photoUri ?? null,
          dropoff_type: item.dropoffType,
          sort_order: i,
        })),
      );

      if (pkgError) throw pkgError;

      router.replace('/(customer)/home');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Could not place return', msg);
    } finally {
      setIsPlacing(false);
    }
  }

  const BOTTOM_BAR_H = 100 + insets.bottom;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      {/* ── Header ───────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xs }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Order</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Scroll content ───────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: BOTTOM_BAR_H + Spacing.md },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Items */}
        <View style={styles.section}>
          <SectionLabel text={`Your packages (${items.length})`} />
          <View style={styles.card}>
            {items.map((item, idx) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <View style={styles.itemCheckBadge}>
                    <Text style={styles.itemCheckText}>✓</Text>
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.itemName}
                    </Text>
                    <View style={styles.itemMeta}>
                      <View style={styles.dropoffChip}>
                        <Text style={styles.dropoffChipText}>
                          {item.dropoffType.toUpperCase()}
                        </Text>
                      </View>
                      {item.qrData ? (
                        <View style={[styles.dropoffChip, styles.qrChip]}>
                          <Text style={[styles.dropoffChipText, { color: Colors.success }]}>
                            QR ✓
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                {idx < items.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Pickup address */}
        <View style={styles.section}>
          <SectionLabel text="Pickup address" />
          <View style={[styles.card, styles.addressCard]}>
            <Text style={styles.addressIcon}>📍</Text>
            <Text style={styles.addressText}>
              {profile?.pickup_address ?? 'No address on file — update in Settings'}
            </Text>
          </View>
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <SectionLabel text="Pricing" />
          <View style={styles.card}>
            <PriceRow
              label={`${items.length} package${items.length !== 1 ? 's' : ''} × $3.85`}
              value={`$${packageFare.toFixed(2)}`}
            />
            <View style={styles.priceDividerThin} />
            <PriceRow
              label={`${MOCK_DISTANCE_MI} mi × $1.00 / mi`}
              value={`$${distanceFare.toFixed(2)}`}
            />
            <View style={styles.priceDivider} />
            <PriceRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} bold />
          </View>
          <Text style={styles.pricingNote}>
            Platform fee included · Runner earns 75% of base + 100% of tips
          </Text>
        </View>

        {/* Tip */}
        <View style={styles.section}>
          <SectionLabel text="Tip your runner" />
          <View style={styles.tipChips}>
            {TIP_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.tipChip, tipOption === opt.value && styles.tipChipActive]}
                onPress={() => setTipOption(opt.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tipChipText,
                    tipOption === opt.value && styles.tipChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tipOption === 'custom' && (
            <View style={styles.customTipBox}>
              <Text style={styles.customTipDollar}>$</Text>
              <TextInput
                style={styles.customTipInput}
                value={customTipInput}
                onChangeText={setCustomTipInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoFocus
              />
            </View>
          )}

          {tip > 0 && (
            <Text style={styles.tipNote}>100% goes directly to your runner 🙌</Text>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom bar ─────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.placeBtn, isPlacing && styles.placeBtnLoading]}
          onPress={handlePlaceReturn}
          disabled={isPlacing}
          activeOpacity={0.85}
        >
          {isPlacing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeBtnText}>Pay ${total.toFixed(2)} →</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 36,
  },
  backText: {
    fontFamily: FontFamily.medium,
    fontSize: 22,
    color: Colors.primary,
    lineHeight: 26,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Sections
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },

  // Card container
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  // Item rows
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  itemCheckBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  itemCheckText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: '#fff',
    lineHeight: 13,
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemName: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 6,
  },
  dropoffChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.background,
    alignSelf: 'flex-start',
  },
  qrChip: {
    borderColor: Colors.success,
    backgroundColor: '#EDF7F1',
  },
  dropoffChipText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.3,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },

  // Address card
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  addressIcon: {
    fontSize: 18,
  },
  addressText: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },

  // Pricing card
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  priceLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  priceLabelBold: {
    fontFamily: FontFamily.semiBold,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  priceValue: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  priceValueBold: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
  },
  priceDividerThin: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    opacity: 0.5,
  },
  priceDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  pricingNote: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },

  // Tip section
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
    marginTop: Spacing.sm,
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
    marginTop: Spacing.sm,
    lineHeight: 19,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  totalValue: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  placeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 17,
    alignItems: 'center',
  },
  placeBtnLoading: {
    opacity: 0.75,
  },
  placeBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.2,
  },
});
