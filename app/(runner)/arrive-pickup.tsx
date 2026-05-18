import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useJobStore } from '@/store/job';
import { SlideToConfirm } from '@/components/SlideToConfirm';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

type ScreenState = 'PHOTO_PROMPT' | 'PHOTO_TAKEN';

export default function ArrivePickup() {
  const insets = useSafeAreaInsets();
  const { activeJob, setActiveJob } = useJobStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [screenState, setScreenState] = useState<ScreenState>('PHOTO_PROMPT');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleTakePhoto() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setScreenState('PHOTO_TAKEN');
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo. Try again.');
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleConfirmPickup() {
    if (!activeJob || isConfirming) return;
    setIsConfirming(true);

    const { data: updated, error } = await supabase
      .from('jobs')
      .update({
        status: 'picked_up',
        picked_up_at: new Date().toISOString(),
      })
      .eq('id', activeJob.id)
      .select()
      .single();

    if (error || !updated) {
      Alert.alert('Error', 'Could not update job. Check connection.');
      setIsConfirming(false);
      return;
    }

    setActiveJob(updated);
    router.replace('/(runner)/navigate-dropoff');
  }

  // ── Permission loading ─────────────────────────────────────────────
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  // ── Permission denied ──────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { paddingTop: insets.top + Spacing.lg }]}>
        <Text style={styles.permTitle}>Camera needed</Text>
        <Text style={styles.permSub}>
          You must photograph the package before confirming pickup.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pickupAddress = activeJob?.pickup_address ?? '123 Oak St, St. Petersburg, FL';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Camera or photo preview ────────────────────── */}
      {screenState === 'PHOTO_PROMPT' ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />
      ) : (
        photoUri && (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )
      )}

      {/* Camera shutter overlay */}
      {screenState === 'PHOTO_PROMPT' && (
        <View style={styles.shutterOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.shutterBtn, isCapturing && { opacity: 0.5 }]}
            onPress={handleTakePhoto}
            disabled={isCapturing}
            activeOpacity={0.85}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      )}

      {/* Retake overlay button when photo taken */}
      {screenState === 'PHOTO_TAKEN' && (
        <TouchableOpacity
          style={styles.retakeBtn}
          onPress={() => { setPhotoUri(null); setScreenState('PHOTO_PROMPT'); }}
          activeOpacity={0.8}
        >
          <Text style={styles.retakeBtnText}>Retake</Text>
        </TouchableOpacity>
      )}

      {/* ── Top status bar ───────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.xs }]}>
        <View style={[
          styles.statusBadge,
          screenState === 'PHOTO_TAKEN' ? styles.statusBadgeDone : styles.statusBadgePending,
        ]}>
          {screenState === 'PHOTO_PROMPT' ? (
            <>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>ARRIVED AT PICKUP</Text>
            </>
          ) : (
            <>
              <Text style={styles.statusTextDone}>✓ PACKAGE PHOTOGRAPHED</Text>
            </>
          )}
        </View>
        <Text style={styles.statusAddress} numberOfLines={1}>{pickupAddress}</Text>
      </View>

      {/* Camera hint overlay */}
      {screenState === 'PHOTO_PROMPT' && (
        <View style={styles.hintOverlay} pointerEvents="none">
          <Text style={styles.hintText}>Photograph the package</Text>
        </View>
      )}

      {/* ── Bottom sheet ─────────────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {screenState === 'PHOTO_PROMPT' ? (
          <>
            <Text style={styles.sheetTitle}>Take a package photo</Text>
            <Text style={styles.sheetSub}>
              Tap the shutter button to photograph the package before pickup.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.sheetTitle}>Photo saved ✓</Text>
            <Text style={styles.sheetSub}>
              Slide to confirm you've picked up the package.
            </Text>
          </>
        )}

        {isConfirming ? (
          <View style={styles.confirmingRow}>
            <ActivityIndicator color={Colors.success} />
            <Text style={styles.confirmingText}>Updating job…</Text>
          </View>
        ) : (
          <SlideToConfirm
            label="Slide — Package Picked Up"
            disabledLabel="📷  Take a photo first"
            disabled={screenState === 'PHOTO_PROMPT'}
            onConfirm={handleConfirmPickup}
            color={Colors.success}
          />
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Permission
  permRoot: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  permTitle: { fontFamily: FontFamily.bold, fontSize: 22, color: Colors.textPrimary, textAlign: 'center' },
  permSub: { fontFamily: FontFamily.regular, fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  permBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.button,
    paddingVertical: 16, alignSelf: 'stretch', alignItems: 'center',
  },
  permBtnText: { fontFamily: FontFamily.semiBold, fontSize: 16, color: '#fff' },

  // Shutter overlay
  shutterOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 260,
  },
  shutterBtn: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff',
  },

  // Retake button
  retakeBtn: {
    position: 'absolute',
    top: 100,
    right: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retakeBtnText: { fontFamily: FontFamily.semiBold, fontSize: 13, color: '#fff' },

  // Top status bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgePending: { backgroundColor: 'rgba(255,255,255,0.15)' },
  statusBadgeDone: { backgroundColor: `${Colors.success}30` },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  statusText: {
    fontFamily: FontFamily.mono,
    fontSize: 11, letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.9)',
  },
  statusTextDone: {
    fontFamily: FontFamily.mono,
    fontSize: 11, letterSpacing: 0.6,
    color: '#6EE7A0',
  },
  statusAddress: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: '#fff',
    paddingHorizontal: 2,
  },

  // Camera hint
  hintOverlay: {
    position: 'absolute',
    bottom: 260,
    left: 0, right: 0,
    alignItems: 'center',
  },
  hintText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
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
  },
  sheetTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  sheetSub: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  confirmingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  confirmingText: {
    fontFamily: FontFamily.medium,
    fontSize: 15,
    color: Colors.success,
  },
});
