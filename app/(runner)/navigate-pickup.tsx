import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useJobStore } from '@/store/job';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

const MOCK_PICKUP = { latitude: 27.7634, longitude: -82.6392 };
const ARRIVAL_RADIUS_M = 150;

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

function fmtDistance(meters: number): string {
  if (meters < 160) return `${Math.round(meters)} ft`;
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters)} ft`;
  return `${miles.toFixed(1)} mi`;
}

function etaMinutes(meters: number): number {
  const miles = meters / 1609.34;
  return Math.max(1, Math.ceil((miles / 20) * 60));
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NavigatePickup() {
  const insets = useSafeAreaInsets();
  const { activeJob } = useJobStore();
  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<LocationSubscription | null>(null);
  const arrivedRef = useRef(false);
  const arrivedAnim = useRef(new Animated.Value(0)).current;

  const destination = {
    latitude: activeJob?.pickup_lat ?? MOCK_PICKUP.latitude,
    longitude: activeJob?.pickup_lng ?? MOCK_PICKUP.longitude,
  };

  const [runnerCoords, setRunnerCoords] = useState(destination); // center near dest until GPS ready
  const [distM, setDistM] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  // Get runner location and watch for arrival
  useEffect(() => {
    if (!activeJob) { router.replace('/(runner)/'); return; }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Initial position
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const init = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setRunnerCoords(init);
      const d = distanceMeters(init.latitude, init.longitude, destination.latitude, destination.longitude);
      setDistM(d);

      mapRef.current?.fitToCoordinates([init, destination], {
        edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
        animated: true,
      });

      // Watch for movement
      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 4000, distanceInterval: 20 },
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setRunnerCoords(coords);
          const dm = distanceMeters(coords.latitude, coords.longitude, destination.latitude, destination.longitude);
          setDistM(dm);

          if (dm <= ARRIVAL_RADIUS_M && !arrivedRef.current) {
            triggerArrival();
          }
        },
      );
    })();

    return () => { locationSubRef.current?.remove(); };
  }, []);

  function triggerArrival() {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    setArrived(true);
    Animated.spring(arrivedAnim, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
  }

  function handleArrived() {
    locationSubRef.current?.remove();
    router.replace('/(runner)/arrive-pickup');
  }

  const eta = distM != null ? etaMinutes(distM) : null;
  const pickupAddress = activeJob?.pickup_address ?? '123 Oak St, St. Petersburg, FL';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Map ──────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
      >
        <Polyline
          coordinates={[runnerCoords, destination]}
          strokeColor={Colors.primary}
          strokeWidth={5}
          lineDashPattern={[0]}
        />
        <Marker coordinate={destination} anchor={{ x: 0.5, y: 1 }} title="Pickup">
          <View style={styles.destMarker}>
            <Text style={styles.destMarkerEmoji}>📦</Text>
          </View>
        </Marker>
      </MapView>

      {/* ── Top turn instruction bar ─────────────────────── */}
      <View style={[styles.turnBar, { paddingTop: insets.top + Spacing.xs }]}>
        <View style={styles.turnBarInner}>
          <View style={styles.turnIcon}>
            <Text style={styles.turnIconText}>→</Text>
          </View>
          <View style={styles.turnInfo}>
            <Text style={styles.turnDistance}>
              {distM != null ? fmtDistance(distM) : '—'}
            </Text>
            <Text style={styles.turnStreet} numberOfLines={1}>
              Head to customer pickup
            </Text>
          </View>
          <View style={styles.etaBox}>
            <Text style={styles.etaValue}>{eta != null ? `${eta}` : '—'}</Text>
            <Text style={styles.etaUnit}>min</Text>
          </View>
        </View>
      </View>

      {/* ── Arrival banner (animated in) ─────────────────── */}
      {arrived && (
        <Animated.View
          style={[
            styles.arrivedBanner,
            { transform: [{ scale: arrivedAnim }], opacity: arrivedAnim },
          ]}
        >
          <Text style={styles.arrivedBannerText}>📍 You've arrived at pickup!</Text>
        </Animated.View>
      )}

      {/* ── Bottom bar ───────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomLabel}>PICKUP</Text>
          <Text style={styles.bottomAddress} numberOfLines={2}>
            {pickupAddress}
          </Text>
          {eta != null && (
            <Text style={styles.bottomEta}>ETA ~{eta} min · {distM != null ? fmtDistance(distM) : '—'}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.arrivedBtn, arrived && styles.arrivedBtnActive]}
          onPress={handleArrived}
          activeOpacity={0.85}
        >
          <Text style={[styles.arrivedBtnText, arrived && styles.arrivedBtnTextActive]}>
            {arrived ? "I've Arrived ✓" : "I've Arrived at Pickup"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  destMarker: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: '#FFF8ED',
    borderWidth: 2.5, borderColor: Colors.warning,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  destMarkerEmoji: { fontSize: 20 },

  // Turn bar
  turnBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    backgroundColor: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  turnBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  turnIcon: {
    width: 44, height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  turnIconText: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: '#fff',
  },
  turnInfo: { flex: 1 },
  turnDistance: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    color: '#fff',
    lineHeight: 24,
  },
  turnStreet: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  etaBox: { alignItems: 'center' },
  etaValue: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: '#fff',
    lineHeight: 26,
  },
  etaUnit: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.3,
  },

  // Arrival banner
  arrivedBanner: {
    position: 'absolute',
    top: '40%',
    left: Spacing.xl,
    right: Spacing.xl,
    backgroundColor: Colors.success,
    borderRadius: Radius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  arrivedBannerText: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: '#fff',
  },

  // Bottom bar
  bottomBar: {
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
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  bottomInfo: { gap: 4 },
  bottomLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
  },
  bottomAddress: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  bottomEta: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  arrivedBtn: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  arrivedBtnActive: {
    backgroundColor: Colors.primary,
  },
  arrivedBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.primary,
    letterSpacing: 0.2,
  },
  arrivedBtnTextActive: {
    color: '#fff',
  },
});
