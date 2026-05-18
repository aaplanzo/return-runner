import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import type { LocationSubscription } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useJobStore } from '@/store/job';
import { SlideToConfirm } from '@/components/SlideToConfirm';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database } from '@/lib/database.types';

type Package = Database['public']['Tables']['packages']['Row'];

const MOCK_DROPOFF = { latitude: 27.7920, longitude: -82.6220 };
const GEOFENCE_RADIUS_M = 50;

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

type GeofenceState = 'APPROACHING' | 'AT_DROPOFF';

// ─── QR Code display ─────────────────────────────────────────────────────────

function QRCodeCard({
  pkg,
  index,
  total,
  locked,
  onPrev,
  onNext,
}: {
  pkg: Package;
  index: number;
  total: number;
  locked: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const code = pkg.qr_code_data ?? 'No code on file';
  const dropoff = pkg.dropoff_type ?? 'Store';

  return (
    <View style={qrStyles.card}>
      <View style={qrStyles.cardHeader}>
        <Text style={qrStyles.cardLabel}>RETURN CODE</Text>
        {total > 1 && (
          <Text style={qrStyles.cardCounter}>pkg {index + 1} of {total}</Text>
        )}
      </View>

      {locked ? (
        <View style={qrStyles.lockedBox}>
          <Text style={qrStyles.lockIcon}>🔒</Text>
          <Text style={qrStyles.lockedTitle}>QR Locked</Text>
          <Text style={qrStyles.lockedSub}>Drive within 50 m of the store to unlock</Text>
        </View>
      ) : (
        <View style={qrStyles.codeBox}>
          {/* Simulated QR grid pattern */}
          <View style={qrStyles.qrGrid}>
            <View style={qrStyles.qrCornerTL} />
            <View style={qrStyles.qrCornerTR} />
            <View style={qrStyles.qrCornerBL} />
            <View style={qrStyles.qrDots} />
          </View>
          <Text style={qrStyles.codeText} selectable>{code}</Text>
          <Text style={qrStyles.codeHint}>Show to store associate · {dropoff}</Text>
        </View>
      )}

      {total > 1 && (
        <View style={qrStyles.navRow}>
          <TouchableOpacity
            style={[qrStyles.navBtn, index === 0 && qrStyles.navBtnDisabled]}
            onPress={onPrev}
            disabled={index === 0}
            activeOpacity={0.7}
          >
            <Text style={[qrStyles.navBtnText, index === 0 && qrStyles.navBtnTextDisabled]}>
              ← Prev
            </Text>
          </TouchableOpacity>
          <View style={qrStyles.navDots}>
            {Array.from({ length: total }).map((_, i) => (
              <View
                key={i}
                style={[qrStyles.navDot, i === index && qrStyles.navDotActive]}
              />
            ))}
          </View>
          <TouchableOpacity
            style={[qrStyles.navBtn, index === total - 1 && qrStyles.navBtnDisabled]}
            onPress={onNext}
            disabled={index === total - 1}
            activeOpacity={0.7}
          >
            <Text style={[qrStyles.navBtnText, index === total - 1 && qrStyles.navBtnTextDisabled]}>
              Next →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const qrStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cardLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.textSecondary,
  },
  cardCounter: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: Colors.primary,
  },
  lockedBox: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  lockIcon: { fontSize: 36 },
  lockedTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
  },
  lockedSub: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 19,
  },
  codeBox: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  qrGrid: {
    width: 120,
    height: 120,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  qrCornerTL: {
    position: 'absolute',
    top: 10, left: 10,
    width: 22, height: 22,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: Colors.textPrimary,
    borderTopLeftRadius: 3,
  },
  qrCornerTR: {
    position: 'absolute',
    top: 10, right: 10,
    width: 22, height: 22,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: Colors.textPrimary,
    borderTopRightRadius: 3,
  },
  qrCornerBL: {
    position: 'absolute',
    bottom: 10, left: 10,
    width: 22, height: 22,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: Colors.textPrimary,
    borderBottomLeftRadius: 3,
  },
  qrDots: {
    width: 48, height: 48,
    backgroundColor: Colors.textPrimary,
    borderRadius: 4,
    opacity: 0.12,
  },
  codeText: {
    fontFamily: FontFamily.mono,
    fontSize: 18,
    letterSpacing: 2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  codeHint: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
    color: Colors.primary,
  },
  navBtnTextDisabled: { color: Colors.textSecondary },
  navDots: { flexDirection: 'row', gap: 5 },
  navDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.border,
  },
  navDotActive: { backgroundColor: Colors.primary, width: 14 },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ArriveDropoff() {
  const insets = useSafeAreaInsets();
  const { activeJob, packages, setActiveJob } = useJobStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const locationSubRef = useRef<LocationSubscription | null>(null);
  const geofencedRef = useRef(false);

  const [geofenceState, setGeofenceState] = useState<GeofenceState>('APPROACHING');
  const [distMeters, setDistMeters] = useState<number | null>(null);
  const [qrIndex, setQrIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const destination = {
    latitude: activeJob?.dropoff_lat ?? MOCK_DROPOFF.latitude,
    longitude: activeJob?.dropoff_lng ?? MOCK_DROPOFF.longitude,
  };

  // ── Location watch for geofence ────────────────────────────────────
  useEffect(() => {
    if (!activeJob) { router.replace('/(runner)/'); return; }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const dm = distanceMeters(
        loc.coords.latitude, loc.coords.longitude,
        destination.latitude, destination.longitude,
      );
      setDistMeters(dm);
      if (dm <= GEOFENCE_RADIUS_M) unlockGeofence();

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 10 },
        (pos) => {
          const dm2 = distanceMeters(
            pos.coords.latitude, pos.coords.longitude,
            destination.latitude, destination.longitude,
          );
          setDistMeters(dm2);
          if (dm2 <= GEOFENCE_RADIUS_M && !geofencedRef.current) unlockGeofence();
        },
      );
    })();

    return () => { locationSubRef.current?.remove(); };
  }, []);

  const unlockGeofence = useCallback(() => {
    if (geofencedRef.current) return;
    geofencedRef.current = true;
    setGeofenceState('AT_DROPOFF');
  }, []);

  // ── Receipt photo ──────────────────────────────────────────────────
  async function handleTakeReceipt() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      if (photo?.uri) {
        setReceiptUri(photo.uri);
        setShowCamera(false);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo.');
    } finally {
      setIsCapturing(false);
    }
  }

  // ── Slide to complete ──────────────────────────────────────────────
  async function handleComplete() {
    if (!activeJob || isConfirming) return;
    setIsConfirming(true);

    try {
      const { data: updated, error } = await supabase
        .from('jobs')
        .update({
          status: 'complete',
          completed_at: new Date().toISOString(),
        })
        .eq('id', activeJob.id)
        .select()
        .single();

      if (error || !updated) throw error ?? new Error('Update failed');

      setActiveJob(updated);

      // The customer app's realtime subscription picks up the status change
      // automatically — this is the in-app equivalent of a push notification.
      // Production: Supabase Edge Function → Expo Push API → customer device.

      locationSubRef.current?.remove();
      router.replace('/(runner)/job-complete');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not complete job.');
      setIsConfirming(false);
    }
  }

  const allPkgs: Package[] = packages.length > 0
    ? packages
    : [{ id: 'mock', job_id: activeJob?.id ?? '', item_name: 'Package', qr_code_data: activeJob?.retailer ?? null, dropoff_type: activeJob?.dropoff_type, item_description: null, qr_image_path: null, item_photo_path: null, receipt_photo_path: null, sort_order: 0, created_at: '' }];

  const dropoffName = activeJob?.dropoff_name ?? activeJob?.retailer ?? 'Store';
  const sliderDisabled = !receiptUri || geofenceState === 'APPROACHING';

  // ── Full-screen receipt camera ─────────────────────────────────────
  if (showCamera) {
    if (!cameraPermission?.granted) {
      return (
        <View style={[styles.permRoot, { paddingTop: insets.top + Spacing.lg }]}>
          <Text style={styles.permTitle}>Camera needed for receipt</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestCameraPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {/* Top bar */}
        <View style={[styles.camTopBar, { paddingTop: insets.top + Spacing.xs }]}>
          <TouchableOpacity onPress={() => setShowCamera(false)} style={styles.camCancelBtn}>
            <Text style={styles.camCancelText}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.camTitle}>Receipt Photo</Text>
          <View style={{ width: 80 }} />
        </View>

        {/* Hint */}
        <View style={styles.camHintOverlay} pointerEvents="none">
          <Text style={styles.camHint}>Photograph the store receipt or screen</Text>
        </View>

        {/* Shutter */}
        <View style={[styles.camShutterRow, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <TouchableOpacity
            style={[styles.shutterBtn, isCapturing && { opacity: 0.5 }]}
            onPress={handleTakeReceipt}
            disabled={isCapturing}
            activeOpacity={0.85}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main scrollable screen ─────────────────────────────────────────
  const BOTTOM_H = 96 + insets.bottom;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xs }]}>
        <View
          style={[
            styles.statusBadge,
            geofenceState === 'AT_DROPOFF' ? styles.statusBadgeGreen : styles.statusBadgeOrange,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: geofenceState === 'AT_DROPOFF' ? Colors.success : Colors.warning },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: geofenceState === 'AT_DROPOFF' ? Colors.success : Colors.warning },
            ]}
          >
            {geofenceState === 'AT_DROPOFF' ? 'LOCATION CONFIRMED' : 'APPROACHING DROPOFF'}
          </Text>
        </View>
        <Text style={styles.headerName} numberOfLines={1}>{dropoffName}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: BOTTOM_H + Spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Distance indicator (APPROACHING only) ───────── */}
        {geofenceState === 'APPROACHING' && (
          <View style={styles.distSection}>
            <View style={styles.distCard}>
              <Text style={styles.distIcon}>📡</Text>
              <Text style={styles.distValue}>
                {distMeters != null ? `${Math.round(distMeters)} m` : '— m'}
              </Text>
              <Text style={styles.distLabel}>away from store</Text>

              {/* Progress bar toward 50m threshold */}
              <View style={styles.distBar}>
                <View
                  style={[
                    styles.distBarFill,
                    {
                      width: distMeters != null
                        ? `${Math.min(100, Math.max(0, (1 - distMeters / 300) * 100))}%`
                        : '0%',
                    },
                  ]}
                />
              </View>
              <Text style={styles.distBarLabel}>
                QR unlocks at {GEOFENCE_RADIUS_M} m
              </Text>

              <TouchableOpacity
                onPress={unlockGeofence}
                style={styles.manualUnlockBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.manualUnlockText}>Confirm location manually →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── QR code section ─────────────────────────────── */}
        <Text style={styles.sectionLabel}>
          {geofenceState === 'APPROACHING' ? 'RETURN CODES (LOCKED)' : 'RETURN CODES — SHOW TO ASSOCIATE'}
        </Text>
        <QRCodeCard
          pkg={allPkgs[qrIndex]}
          index={qrIndex}
          total={allPkgs.length}
          locked={geofenceState === 'APPROACHING'}
          onPrev={() => setQrIndex((i) => Math.max(0, i - 1))}
          onNext={() => setQrIndex((i) => Math.min(allPkgs.length - 1, i + 1))}
        />

        {/* ── Receipt photo section ────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>RECEIPT PHOTO</Text>
        <View style={styles.receiptCard}>
          {receiptUri ? (
            <>
              <Image source={{ uri: receiptUri }} style={styles.receiptPreview} resizeMode="cover" />
              <View style={styles.receiptActions}>
                <Text style={styles.receiptDone}>✓ Receipt captured</Text>
                <TouchableOpacity
                  onPress={() => setReceiptUri(null)}
                  style={styles.retakeBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.receiptEmpty}>
              <Text style={styles.receiptEmptyIcon}>🧾</Text>
              <Text style={styles.receiptEmptyTitle}>Receipt required</Text>
              <Text style={styles.receiptEmptySub}>
                Photograph the digital or printed receipt from the store.
              </Text>
              <TouchableOpacity
                style={[
                  styles.receiptCamBtn,
                  geofenceState === 'APPROACHING' && styles.receiptCamBtnDisabled,
                ]}
                onPress={async () => {
                  if (!cameraPermission?.granted) await requestCameraPermission();
                  setShowCamera(true);
                }}
                disabled={geofenceState === 'APPROACHING'}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.receiptCamBtnText,
                  geofenceState === 'APPROACHING' && styles.receiptCamBtnTextDisabled,
                ]}>
                  {geofenceState === 'APPROACHING' ? '🔒 Unlock location first' : 'Take Receipt Photo'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed slider ─────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        {isConfirming ? (
          <View style={styles.confirmingRow}>
            <ActivityIndicator color={Colors.success} />
            <Text style={styles.confirmingText}>Completing job…</Text>
          </View>
        ) : (
          <SlideToConfirm
            label="Slide — Return Complete"
            disabledLabel={
              geofenceState === 'APPROACHING'
                ? '🔒  Drive to store first'
                : '🧾  Take receipt photo first'
            }
            disabled={sliderDisabled}
            onConfirm={handleComplete}
            color={Colors.success}
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Permission
  permRoot: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  permTitle: { fontFamily: FontFamily.bold, fontSize: 20, color: Colors.textPrimary, textAlign: 'center' },
  permBtn: { backgroundColor: Colors.primary, borderRadius: Radius.button, paddingVertical: 16, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  permBtnText: { fontFamily: FontFamily.semiBold, fontSize: 16, color: '#fff' },

  // Camera overlay
  camTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
  },
  camCancelBtn: { paddingTop: 2 },
  camCancelText: { fontFamily: FontFamily.semiBold, fontSize: 15, color: '#fff' },
  camTitle: { fontFamily: FontFamily.bold, fontSize: 16, color: '#fff', paddingTop: 2 },
  camHintOverlay: {
    position: 'absolute', bottom: 200, left: 0, right: 0,
    alignItems: 'center',
  },
  camHint: {
    fontFamily: FontFamily.medium, fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, overflow: 'hidden',
  },
  camShutterRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center',
  },
  shutterBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 5,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeGreen: { backgroundColor: '#EDF7F1' },
  statusBadgeOrange: { backgroundColor: '#FFF8ED' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: FontFamily.mono, fontSize: 11, letterSpacing: 0.6 },
  headerName: { fontFamily: FontFamily.bold, fontSize: 18, color: Colors.textPrimary },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingTop: Spacing.lg, gap: Spacing.sm },

  // Section labels
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.lg,
    marginBottom: 4,
    textTransform: 'uppercase',
  },

  // Distance section
  distSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  distCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  distIcon: { fontSize: 28 },
  distValue: { fontFamily: FontFamily.bold, fontSize: 36, color: Colors.textPrimary, letterSpacing: -1 },
  distLabel: { fontFamily: FontFamily.regular, fontSize: 13, color: Colors.textSecondary },
  distBar: {
    width: '80%', height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  distBarFill: { height: '100%', backgroundColor: Colors.warning, borderRadius: 3 },
  distBarLabel: { fontFamily: FontFamily.regular, fontSize: 12, color: Colors.textSecondary },
  manualUnlockBtn: { marginTop: 4, paddingVertical: 4 },
  manualUnlockText: { fontFamily: FontFamily.medium, fontSize: 13, color: Colors.primary },

  // Receipt card
  receiptCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  receiptPreview: { width: '100%', height: 180 },
  receiptActions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  receiptDone: { fontFamily: FontFamily.semiBold, fontSize: 14, color: Colors.success },
  retakeBtn: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  retakeBtnText: { fontFamily: FontFamily.medium, fontSize: 13, color: Colors.textSecondary },
  receiptEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  receiptEmptyIcon: { fontSize: 32 },
  receiptEmptyTitle: { fontFamily: FontFamily.bold, fontSize: 16, color: Colors.textPrimary },
  receiptEmptySub: {
    fontFamily: FontFamily.regular, fontSize: 13,
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 19,
  },
  receiptCamBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 14, paddingHorizontal: Spacing.xl,
    alignSelf: 'stretch', alignItems: 'center',
    marginTop: Spacing.xs,
  },
  receiptCamBtnDisabled: { backgroundColor: Colors.border },
  receiptCamBtnText: { fontFamily: FontFamily.semiBold, fontSize: 15, color: '#fff' },
  receiptCamBtnTextDisabled: { color: Colors.textSecondary },

  // Bottom action bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1.5,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  confirmingRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  confirmingText: { fontFamily: FontFamily.semiBold, fontSize: 15, color: Colors.success },
});
