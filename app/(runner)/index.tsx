import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database } from '@/lib/database.types';

type Job = Database['public']['Tables']['jobs']['Row'];

// Default map center: St. Petersburg, FL
const DEFAULT_REGION: Region = {
  latitude: 27.7734,
  longitude: -82.6392,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};

function formatEarnings(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function RunnerHome() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<LocationSubscription | null>(null);

  const [isOnline, setIsOnline] = useState(profile?.is_online ?? false);
  const [isToggling, setIsToggling] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
    profile?.current_lat && profile?.current_lng
      ? { lat: profile.current_lat, lng: profile.current_lng }
      : null,
  );
  // Placeholder — real earnings would come from a Supabase query
  const [todayEarnings] = useState(0);

  // Subscribe to pending jobs while online
  useEffect(() => {
    if (!profile?.id || !isOnline) return;

    const channel = supabase
      .channel(`runner-pending-jobs-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs', filter: 'status=eq.pending' },
        async (payload) => {
          const job = payload.new as Job;
          if (job.runner_id && job.runner_id !== profile.id) return;

          const { data: declined } = await supabase
            .from('job_declines')
            .select('id')
            .eq('job_id', job.id)
            .eq('runner_id', profile.id)
            .maybeSingle();

          if (!declined) {
            router.push({ pathname: '/(runner)/job-ping', params: { jobId: job.id } });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isOnline, profile?.id]);

  // Get current location on mount to center the map
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserCoords(coords);
      mapRef.current?.animateToRegion(
        {
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        },
        800,
      );
    })();

    return () => {
      locationSubRef.current?.remove();
    };
  }, []);

  const startLocationWatch = useCallback(async () => {
    if (!profile?.id) return;

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 8000,
        distanceInterval: 30,
      },
      async (loc) => {
        const { latitude: lat, longitude: lng, heading } = loc.coords;
        setUserCoords({ lat, lng });
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.06, longitudeDelta: 0.06 },
          500,
        );

        await Promise.all([
          supabase.from('runner_locations').insert({
            runner_id: profile.id,
            lat,
            lng,
            heading: heading ?? null,
          }),
          supabase
            .from('users')
            .update({ current_lat: lat, current_lng: lng })
            .eq('id', profile.id),
        ]);
      },
    );
  }, [profile?.id]);

  function stopLocationWatch() {
    locationSubRef.current?.remove();
    locationSubRef.current = null;
  }

  async function handleToggleOnline() {
    if (!profile?.id || isToggling) return;
    setIsToggling(true);

    try {
      const goingOnline = !isOnline;

      if (goingOnline) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Location required',
            'Enable location access in Settings to go online and receive job requests.',
          );
          return;
        }
        await startLocationWatch();
      } else {
        stopLocationWatch();
      }

      const { error } = await supabase
        .from('users')
        .update({ is_online: goingOnline })
        .eq('id', profile.id);

      if (error) throw error;
      setIsOnline(goingOnline);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', msg);
    } finally {
      setIsToggling(false);
    }
  }

  async function handleSignOut() {
    stopLocationWatch();
    if (profile?.id) {
      await supabase.from('users').update({ is_online: false }).eq('id', profile.id);
    }
    await supabase.auth.signOut();
  }

  const initialRegion: Region =
    userCoords
      ? {
          latitude: userCoords.lat,
          longitude: userCoords.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }
      : DEFAULT_REGION;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* ── Map ──────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
      >
        {userCoords && (
          <Marker
            coordinate={{ latitude: userCoords.lat, longitude: userCoords.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.runnerMarker, isOnline && styles.runnerMarkerOnline]}>
              <Text style={styles.runnerMarkerEmoji}>🏃</Text>
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Top bar ──────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.xs }]}>
        <View style={styles.topBarCard}>
          <View style={styles.topBarLeft}>
            <Text style={styles.runnerName}>
              {profile?.first_name
                ? `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ''}`
                : 'Runner'}
            </Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  isOnline ? styles.statusDotOnline : styles.statusDotOffline,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  isOnline ? styles.statusTextOnline : styles.statusTextOffline,
                ]}
              >
                {isOnline ? 'Online · Accepting jobs' : 'Offline'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Bottom card ──────────────────────────────────── */}
      <View style={[styles.bottomCard, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Earnings row */}
        <View style={styles.earningsRow}>
          <View>
            <Text style={styles.earningsLabel}>TODAY'S EARNINGS</Text>
            <Text style={styles.earningsValue}>{formatEarnings(todayEarnings)}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isOnline ? styles.statusBadgeOnline : styles.statusBadgeOffline,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                isOnline ? styles.statusBadgeTextOnline : styles.statusBadgeTextOffline,
              ]}
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Toggle button */}
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            isOnline ? styles.toggleBtnOff : styles.toggleBtnOn,
            (isToggling) && styles.toggleBtnBusy,
          ]}
          onPress={handleToggleOnline}
          disabled={isToggling}
          activeOpacity={0.85}
        >
          {isToggling ? (
            <ActivityIndicator color={isOnline ? Colors.error : '#fff'} />
          ) : (
            <Text
              style={[
                styles.toggleBtnText,
                isOnline ? styles.toggleBtnTextOff : styles.toggleBtnTextOn,
              ]}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </Text>
          )}
        </TouchableOpacity>

        {isOnline && (
          <Text style={styles.waitingText}>Waiting for job requests nearby…</Text>
        )}
        {!isOnline && (
          <Text style={styles.offlineSubtext}>
            Go online to start receiving return jobs.
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Runner map marker
  runnerMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 2.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  runnerMarkerOnline: {
    borderColor: Colors.success,
    backgroundColor: '#EDF7F1',
  },
  runnerMarkerEmoji: {
    fontSize: 20,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  topBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  topBarLeft: {
    gap: 4,
  },
  runnerName: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: Colors.success,
  },
  statusDotOffline: {
    backgroundColor: Colors.textSecondary,
  },
  statusText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
  },
  statusTextOnline: {
    color: Colors.success,
  },
  statusTextOffline: {
    color: Colors.textSecondary,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  signOutText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // Bottom card
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  earningsLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  earningsValue: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeOnline: {
    backgroundColor: '#EDF7F1',
  },
  statusBadgeOffline: {
    backgroundColor: Colors.background,
  },
  statusBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  statusBadgeTextOnline: {
    color: Colors.success,
  },
  statusBadgeTextOffline: {
    color: Colors.textSecondary,
  },

  // Online/Offline toggle button
  toggleBtn: {
    borderRadius: Radius.button,
    paddingVertical: 18,
    alignItems: 'center',
  },
  toggleBtnOn: {
    backgroundColor: Colors.primary,
  },
  toggleBtnOff: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.error,
  },
  toggleBtnBusy: {
    opacity: 0.7,
  },
  toggleBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  toggleBtnTextOn: {
    color: '#fff',
  },
  toggleBtnTextOff: {
    color: Colors.error,
  },

  // Sub-text under toggle
  waitingText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  offlineSubtext: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
