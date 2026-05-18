import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database, JobStatus } from '@/lib/database.types';

type Job = Database['public']['Tables']['jobs']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

const MOCK_RUNNER = { latitude: 27.7600, longitude: -82.6400 };
const MOCK_PICKUP = { latitude: 27.7634, longitude: -82.6392 };
const MOCK_DROPOFF = { latitude: 27.7920, longitude: -82.6220 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etaMinutes(meters: number): number {
  const miles = meters / 1609.34;
  return Math.max(1, Math.ceil((miles / 20) * 60));
}

function starsDisplay(rating: number): string {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ─── Status timeline ─────────────────────────────────────────────────────────

const TIMELINE: { key: JobStatus | 'en_route'; label: string; emoji: string }[] = [
  { key: 'accepted',  label: 'Runner accepted',    emoji: '✓'  },
  { key: 'en_route',  label: 'En route to pickup', emoji: '🚗' },
  { key: 'picked_up', label: 'Package picked up',  emoji: '📦' },
  { key: 'complete',  label: 'Delivered to store', emoji: '🏪' },
];

function getTimelineIndex(status: JobStatus): number {
  if (status === 'accepted')                return 0;
  if (status === 'picked_up')               return 2;
  if (status === 'dropped_off' || status === 'complete') return 3;
  return 1; // pending / other
}

function StatusTimeline({ status }: { status: JobStatus }) {
  const activeIdx = getTimelineIndex(status);

  return (
    <View style={tlStyles.container}>
      {TIMELINE.map((step, idx) => {
        const done = idx < activeIdx;
        const active = idx === activeIdx;
        return (
          <View key={step.key} style={tlStyles.stepWrap}>
            {idx > 0 && (
              <View style={[tlStyles.connector, (done || active) && tlStyles.connectorActive]} />
            )}
            <View style={[
              tlStyles.dot,
              done && tlStyles.dotDone,
              active && tlStyles.dotActive,
            ]}>
              {done ? (
                <Text style={tlStyles.dotCheck}>✓</Text>
              ) : (
                <View style={[tlStyles.dotInner, active && tlStyles.dotInnerActive]} />
              )}
            </View>
            <Text
              style={[tlStyles.label, (done || active) && tlStyles.labelActive]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const tlStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  stepWrap: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 10,
    left: '-50%',
    right: '50%',
    height: 2,
    backgroundColor: Colors.border,
    zIndex: 0,
  },
  connectorActive: {
    backgroundColor: Colors.success,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    marginBottom: 4,
  },
  dotDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  dotActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotInnerActive: {
    backgroundColor: Colors.primary,
  },
  dotCheck: {
    fontSize: 11,
    color: '#fff',
    fontFamily: FontFamily.bold,
  },
  label: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 13,
  },
  labelActive: {
    fontFamily: FontFamily.medium,
    color: Colors.textPrimary,
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function LiveTracking() {
  const insets = useSafeAreaInsets();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const mapRef = useRef<MapView>(null);
  const slideAnim = useRef(new Animated.Value(200)).current;

  const [job, setJob] = useState<Job | null>(null);
  const [runner, setRunner] = useState<UserRow | null>(null);
  const [runnerCoords, setRunnerCoords] = useState(MOCK_RUNNER);
  const [eta, setEta] = useState<number | null>(null);

  // Entrance animation for bottom sheet
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  }, []);

  // Load job + runner profile
  useEffect(() => {
    if (!jobId) return;

    (async () => {
      const { data: jobData } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (!jobData) return;
      setJob(jobData);

      if (jobData.runner_id) {
        const { data: runnerData } = await supabase
          .from('users')
          .select('*')
          .eq('id', jobData.runner_id)
          .single();
        setRunner(runnerData ?? null);
      }
    })();
  }, [jobId]);

  // Realtime runner location subscription
  useEffect(() => {
    if (!job?.runner_id) return;

    const channel = supabase
      .channel(`runner-location-${job.runner_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'runner_locations',
          filter: `runner_id=eq.${job.runner_id}`,
        },
        (payload) => {
          const loc = payload.new as { lat: number; lng: number };
          if (!loc?.lat || !loc?.lng) return;
          const coords = { latitude: loc.lat, longitude: loc.lng };
          setRunnerCoords(coords);
          recalcEta(coords);
        },
      )
      .subscribe();

    // Also fetch current location immediately
    supabase
      .from('runner_locations')
      .select('lat, lng')
      .eq('runner_id', job.runner_id)
      .single()
      .then(({ data }) => {
        if (data?.lat && data?.lng) {
          const coords = { latitude: data.lat, longitude: data.lng };
          setRunnerCoords(coords);
          recalcEta(coords);
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [job?.runner_id]);

  // Realtime job status updates
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job-status-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          const updated = payload.new as Job;
          setJob((prev) => prev ? { ...prev, ...updated } : null);

          // Navigate straight to rating screen when runner marks job complete
          if (updated.status === 'complete' && updated.runner_id) {
            router.replace({
              pathname: '/(customer)/rate-runner',
              params: { jobId: updated.id, runnerId: updated.runner_id },
            });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  function recalcEta(coords: { latitude: number; longitude: number }) {
    if (!job) return;
    const targetLat = job.status === 'picked_up'
      ? (job.dropoff_lat ?? MOCK_DROPOFF.latitude)
      : (job.pickup_lat ?? MOCK_PICKUP.latitude);
    const targetLng = job.status === 'picked_up'
      ? (job.dropoff_lng ?? MOCK_DROPOFF.longitude)
      : (job.pickup_lng ?? MOCK_PICKUP.longitude);
    const dm = distanceMeters(coords.latitude, coords.longitude, targetLat, targetLng);
    setEta(etaMinutes(dm));
  }

  // Fit map when runner location and job are known
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
    mapRef.current.fitToCoordinates([runnerCoords, pickup, dropoff], {
      edgePadding: { top: 120, right: 60, bottom: 340, left: 60 },
      animated: true,
    });
  }, [job?.id]);

  function handleContact() {
    if (runner?.phone) {
      Linking.openURL(`tel:${runner.phone}`).catch(() => {
        Alert.alert('Cannot call', 'Unable to open the phone app.');
      });
    } else {
      Alert.alert('Contact Runner', 'Runner phone number is not available yet.');
    }
  }

  const pickup = {
    latitude: job?.pickup_lat ?? MOCK_PICKUP.latitude,
    longitude: job?.pickup_lng ?? MOCK_PICKUP.longitude,
  };
  const dropoff = {
    latitude: job?.dropoff_lat ?? MOCK_DROPOFF.latitude,
    longitude: job?.dropoff_lng ?? MOCK_DROPOFF.longitude,
  };

  // Route line: runner → pickup (if not yet picked up), then pickup → dropoff
  const routeCoords = job?.status === 'picked_up'
    ? [runnerCoords, dropoff]
    : [runnerCoords, pickup, dropoff];

  const runnerName = runner
    ? `${runner.first_name ?? ''} ${runner.last_name ?? ''}`.trim() || 'Your Runner'
    : 'Your Runner';
  const rating = runner?.rating_avg ?? 0;
  const ratingCount = runner?.rating_count ?? 0;
  const jobStatus: JobStatus = (job?.status as JobStatus) ?? 'accepted';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Full-screen map ─────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: MOCK_PICKUP.latitude,
          longitude: MOCK_PICKUP.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
      >
        {/* Route line */}
        <Polyline
          coordinates={routeCoords}
          strokeColor={Colors.primary}
          strokeWidth={4}
          lineDashPattern={[8, 4]}
        />

        {/* Runner dot */}
        <Marker coordinate={runnerCoords} anchor={{ x: 0.5, y: 0.5 }} title="Runner">
          <View style={styles.runnerMarker}>
            <Text style={styles.runnerMarkerEmoji}>🏃</Text>
          </View>
        </Marker>

        {/* Pickup marker */}
        <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }} title="Your address">
          <View style={styles.pickupMarker}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </View>
        </Marker>

        {/* Dropoff marker */}
        <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 1 }} title="Store">
          <View style={styles.dropoffMarker}>
            <Text style={styles.markerEmoji}>🏪</Text>
          </View>
        </Marker>
      </MapView>

      {/* ── Top bar ──────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>Live Tracking</Text>
          {eta != null && (
            <View style={styles.etaBadge}>
              <Text style={styles.etaBadgeText}>ETA ~{eta} min</Text>
            </View>
          )}
        </View>

        <View style={styles.backBtn} />
      </View>

      {/* ── Bottom sheet ─────────────────────────────────── */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + Spacing.md, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Runner info row */}
        <View style={styles.runnerRow}>
          <View style={styles.runnerAvatar}>
            <Text style={styles.runnerAvatarEmoji}>🏃</Text>
          </View>
          <View style={styles.runnerInfo}>
            <Text style={styles.runnerName}>{runnerName}</Text>
            {ratingCount > 0 ? (
              <Text style={styles.runnerRating}>
                {starsDisplay(rating)} {rating.toFixed(1)} ({ratingCount})
              </Text>
            ) : (
              <Text style={styles.runnerRating}>New runner</Text>
            )}
          </View>
          <TouchableOpacity style={styles.contactBtn} onPress={handleContact} activeOpacity={0.8}>
            <Text style={styles.contactBtnEmoji}>📞</Text>
            <Text style={styles.contactBtnText}>Contact</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Status label */}
        <Text style={styles.statusLabel}>
          {jobStatus === 'accepted' && '🚗  Runner is heading to your address'}
          {jobStatus === 'picked_up' && '📦  Packages picked up — heading to store'}
          {(jobStatus === 'dropped_off' || jobStatus === 'complete') && '✅  Return complete!'}
        </Text>

        {/* Timeline */}
        <StatusTimeline status={jobStatus} />
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Markers
  runnerMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  runnerMarkerEmoji: { fontSize: 18 },
  pickupMarker: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: '#EEF3FA',
    borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  dropoffMarker: {
    width: 38, height: 38, borderRadius: 8,
    backgroundColor: '#EDF7F1',
    borderWidth: 2, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  markerEmoji: { fontSize: 18 },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    color: Colors.primary,
    lineHeight: 34,
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  topBarTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  etaBadge: {
    backgroundColor: '#EDF7F1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${Colors.success}50`,
  },
  etaBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Colors.success,
    letterSpacing: 0.3,
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },

  // Runner row
  runnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  runnerAvatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#EEF3FA',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.border,
  },
  runnerAvatarEmoji: { fontSize: 24 },
  runnerInfo: { flex: 1, gap: 3 },
  runnerName: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
  },
  runnerRating: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  contactBtn: {
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF3FA',
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  contactBtnEmoji: { fontSize: 18 },
  contactBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.primary,
  },

  divider: { height: 1, backgroundColor: Colors.border },

  statusLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});
