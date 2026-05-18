import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useJobStore } from '@/store/job';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database } from '@/lib/database.types';

type Job = Database['public']['Tables']['jobs']['Row'];
type Package = Database['public']['Tables']['packages']['Row'];

// ─── Mock fallback coords (St. Petersburg, FL) ───────────────────────────────
const MOCK_PICKUP = { latitude: 27.7634, longitude: -82.6392 };
const MOCK_DROPOFF = { latitude: 27.7920, longitude: -82.6220 };
const MOCK_RUNNER = { latitude: 27.7500, longitude: -82.6450 };
const TIMER_SECONDS = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcDistanceMi(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcHourlyRate(totalPay: number, totalMiles: number): number {
  const mins = Math.ceil((totalMiles / 20) * 60) + 12;
  const hours = mins / 60;
  return Math.round(totalPay / hours);
}

function fmt$(n: number | null): string {
  return n == null ? '—' : `$${n.toFixed(2)}`;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function JobPing() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { setActiveJob, setPackages, setCustomerName } = useJobStore();
  const params = useLocalSearchParams<{ jobId: string }>();

  const mapRef = useRef<MapView>(null);
  const timerAnim = useRef(new Animated.Value(1)).current;

  const [job, setJob] = useState<Job | null>(null);
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [customerFirst, setCustomerFirst] = useState<string>('Customer');
  const [runnerCoords, setRunnerCoords] = useState(MOCK_RUNNER);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const declinedRef = useRef(false);

  // ── Load job data ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      if (!params.jobId) return;

      // Fetch job
      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', params.jobId)
        .single();
      if (!jobData) { router.replace('/(runner)/'); return; }
      setJob(jobData);

      // Fetch packages
      const { data: pkgData } = await supabase
        .from('packages')
        .select('*')
        .eq('job_id', params.jobId);
      setPkgs(pkgData ?? []);

      // Fetch customer name
      const { data: customer } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', jobData.customer_id)
        .single();
      if (customer?.first_name) {
        setCustomerFirst(
          `${customer.first_name} ${customer.last_name ? customer.last_name[0] + '.' : ''}`.trim(),
        );
      }

      // Runner GPS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setRunnerCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }

      setIsLoading(false);
    }
    load();
  }, [params.jobId]);

  // ── Fit map to all three points once job loads ─────────────────────
  useEffect(() => {
    if (!job || !mapRef.current) return;
    const pickup = {
      latitude: job.pickup_lat ?? MOCK_PICKUP.latitude,
      longitude: job.pickup_lng ?? MOCK_PICKUP.longitude,
    };
    const dropoff = {
      latitude: job.dropoff_lat ?? MOCK_DROPOFF.latitude,
      longitude: job.dropoff_lng ?? MOCK_DROPOFF.longitude,
    };
    setTimeout(() => {
      mapRef.current?.fitToCoordinates([runnerCoords, pickup, dropoff], {
        edgePadding: { top: 80, right: 40, bottom: 380, left: 40 },
        animated: true,
      });
    }, 400);
  }, [job, runnerCoords]);

  // ── 15-second timer ────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(timerAnim, {
      toValue: 0,
      duration: TIMER_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !declinedRef.current) handleDecline(true);
    });

    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);

    return () => {
      timerAnim.stopAnimation();
      clearInterval(interval);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────

  async function handleAccept() {
    if (!job || !profile?.id || isActing) return;
    setIsActing(true);
    declinedRef.current = true;

    const { data: accepted, error } = await supabase
      .from('jobs')
      .update({
        status: 'accepted',
        runner_id: profile.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !accepted) {
      Alert.alert('Job no longer available', 'This job was taken by another runner.');
      router.replace('/(runner)/');
      return;
    }

    setActiveJob(accepted);
    setPackages(pkgs);
    setCustomerName(customerFirst);

    router.replace('/(runner)/navigate-pickup');
  }

  async function handleDecline(expired = false) {
    if (declinedRef.current && !expired) return;
    declinedRef.current = true;

    if (profile?.id && params.jobId) {
      await supabase.from('job_declines').insert({
        job_id: params.jobId,
        runner_id: profile.id,
      });
    }
    router.replace('/(runner)/');
  }

  // ── Derived display values ──────────────────────────────────────────
  const pickup = {
    latitude: job?.pickup_lat ?? MOCK_PICKUP.latitude,
    longitude: job?.pickup_lng ?? MOCK_PICKUP.longitude,
  };
  const dropoff = {
    latitude: job?.dropoff_lat ?? MOCK_DROPOFF.latitude,
    longitude: job?.dropoff_lng ?? MOCK_DROPOFF.longitude,
  };

  const distToPickupMi = calcDistanceMi(
    runnerCoords.latitude, runnerCoords.longitude,
    pickup.latitude, pickup.longitude,
  );
  const totalMiles = distToPickupMi + (job?.distance_miles ?? 3.2);
  const totalPay = (job?.runner_payout ?? 0) + (job?.tip_amount ?? 0);
  const hourlyRate = calcHourlyRate(totalPay, totalMiles);
  const etaMins = Math.ceil((totalMiles / 20) * 60) + 10;

  const timerColor = timerAnim.interpolate({
    inputRange: [0, 0.33, 1],
    outputRange: [Colors.error, Colors.warning, Colors.success],
  });
  const timerWidth = timerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Map ──────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: runnerCoords.latitude,
          longitude: runnerCoords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        rotateEnabled={false}
      >
        {/* Runner → Pickup route */}
        <Polyline
          coordinates={[runnerCoords, pickup]}
          strokeColor={Colors.warning}
          strokeWidth={3}
          lineDashPattern={[6, 4]}
        />
        {/* Pickup → Dropoff route */}
        <Polyline
          coordinates={[pickup, dropoff]}
          strokeColor={Colors.primary}
          strokeWidth={4}
        />

        {/* Runner marker */}
        <Marker coordinate={runnerCoords} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.markerRunner}>
            <Text style={styles.markerEmoji}>🏃</Text>
          </View>
        </Marker>

        {/* Pickup marker */}
        <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }} title="Pickup">
          <View style={[styles.markerPin, styles.markerPickup]}>
            <Text style={styles.markerPinEmoji}>📦</Text>
          </View>
        </Marker>

        {/* Dropoff marker */}
        <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 1 }} title="Dropoff">
          <View style={[styles.markerPin, styles.markerDropoff]}>
            <Text style={styles.markerPinEmoji}>🏪</Text>
          </View>
        </Marker>
      </MapView>

      {/* ── Bottom job card ───────────────────────────────── */}
      <View style={[styles.card, { paddingBottom: insets.bottom + Spacing.md }]}>
        {/* Timer bar */}
        <View style={styles.timerRow}>
          <Text style={styles.timerLabel}>JOB REQUEST</Text>
          <Text style={styles.timerCount}>{timeLeft}s</Text>
        </View>
        <View style={styles.timerTrack}>
          <Animated.View
            style={[styles.timerFill, { width: timerWidth, backgroundColor: timerColor }]}
          />
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <ScrollView
            style={styles.cardScroll}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Job headline */}
            <View style={styles.headline}>
              <View>
                <Text style={styles.headlineType}>Package Return</Text>
                <Text style={styles.headlineCustomer}>
                  {customerFirst} · {job?.package_count ?? pkgs.length} pkg
                  {(job?.package_count ?? pkgs.length) !== 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.payBox}>
                <Text style={styles.payAmount}>{fmt$(totalPay)}</Text>
                <Text style={styles.payLabel}>est. total</Text>
              </View>
            </View>

            {/* Pay breakdown */}
            <View style={styles.payBreakdown}>
              <View style={styles.payChip}>
                <Text style={styles.payChipLabel}>Base (75%)</Text>
                <Text style={styles.payChipVal}>{fmt$(job?.runner_payout ?? null)}</Text>
              </View>
              <View style={styles.payChipDot} />
              <View style={styles.payChip}>
                <Text style={styles.payChipLabel}>Est. tip</Text>
                <Text style={styles.payChipVal}>{fmt$(job?.tip_amount ?? 0)}</Text>
              </View>
              <View style={styles.payChipDot} />
              <View style={styles.payChip}>
                <Text style={[styles.payChipLabel, { color: Colors.primary }]}>~${hourlyRate}/hr</Text>
                <Text style={styles.payChipVal}>rate</Text>
              </View>
            </View>

            {/* Route details */}
            <View style={styles.routeRow}>
              {/* Pickup */}
              <View style={styles.routeCol}>
                <View style={styles.routeColHeader}>
                  <View style={[styles.routeDot, { backgroundColor: Colors.warning }]} />
                  <Text style={styles.routeColTitle}>PICKUP</Text>
                </View>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {job?.pickup_address ?? '123 Oak St\nSt. Petersburg, FL'}
                </Text>
                <Text style={styles.routeMeta}>
                  {distToPickupMi.toFixed(1)} mi from you
                </Text>
              </View>

              <View style={styles.routeDivider} />

              {/* Dropoff */}
              <View style={styles.routeCol}>
                <View style={styles.routeColHeader}>
                  <View style={[styles.routeDot, { backgroundColor: Colors.primary }]} />
                  <Text style={styles.routeColTitle}>DROPOFF</Text>
                </View>
                <Text style={styles.routeAddress} numberOfLines={2}>
                  {job?.dropoff_name ?? job?.retailer ?? 'UPS Store'}
                </Text>
                <Text style={styles.routeMeta}>
                  {(job?.distance_miles ?? 3.2).toFixed(1)} mi from pickup
                </Text>
              </View>
            </View>

            {/* Summary row */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>📍 {totalMiles.toFixed(1)} mi total</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>⏱ ~{etaMins} min</Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryChipText}>
                  {job?.retailer ?? pkgs[0]?.dropoff_type ?? 'UPS Store'}
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Accept / Decline buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleDecline(false)}
            disabled={isActing}
            activeOpacity={0.7}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptBtn, isActing && { opacity: 0.7 }]}
            onPress={handleAccept}
            disabled={isActing || isLoading}
            activeOpacity={0.85}
          >
            {isActing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept Job →</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Map markers
  markerRunner: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 2, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  markerEmoji: { fontSize: 18 },
  markerPin: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  markerPickup: { backgroundColor: '#FFF8ED', borderColor: Colors.warning },
  markerDropoff: { backgroundColor: '#EEF3FA', borderColor: Colors.primary },
  markerPinEmoji: { fontSize: 18 },

  // Bottom card
  card: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: Colors.border,
    paddingTop: Spacing.md,
    maxHeight: '62%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },

  // Timer
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: 6,
  },
  timerLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    color: Colors.textSecondary,
  },
  timerCount: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  timerTrack: {
    height: 4,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    borderRadius: 2,
  },

  loadingBox: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },

  cardScroll: {
    paddingHorizontal: Spacing.lg,
  },

  // Headline
  headline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  headlineType: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  headlineCustomer: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  payBox: { alignItems: 'flex-end' },
  payAmount: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  payLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },

  // Pay breakdown chips
  payBreakdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.md,
  },
  payChip: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  payChipLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  payChipVal: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  payChipDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: Colors.border,
  },

  // Route row
  routeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  routeCol: { flex: 1, gap: 4 },
  routeColHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeColTitle: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
  },
  routeAddress: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  routeMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  routeDivider: {
    width: 1,
    backgroundColor: Colors.border,
    alignSelf: 'stretch',
  },

  // Summary chips
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  summaryChip: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryChipText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  declineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  declineBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.2,
  },
});
