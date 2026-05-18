import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type SelectedItem = {
  id: string;
  itemName: string;
  dropoffType: string;
  orderId: string;
};

type ItemCapture = {
  qrData: string;
  photoUri: string | null;
};

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function QrPerItem() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const params = useLocalSearchParams<{ items: string }>();

  const items: SelectedItem[] = params.items ? JSON.parse(params.items) : [];

  const [stepIndex, setStepIndex] = useState(0);
  const [subStep, setSubStep] = useState<'qr' | 'photo'>('qr');
  const [captures, setCaptures] = useState<Record<string, ItemCapture>>({});
  const [qrInput, setQrInput] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);

  const currentItem = items[stepIndex];
  const isLastItem = stepIndex === items.length - 1;

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScanned || subStep !== 'qr') return;
      setHasScanned(true);
      setQrInput(result.data);
    },
    [hasScanned, subStep],
  );

  async function handleTakePhoto() {
    if (!cameraRef.current || isCapturingPhoto) return;
    setIsCapturingPhoto(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo?.uri) setPhotoUri(photo.uri);
    } catch {
      Alert.alert('Error', 'Could not capture photo. Try again.');
    } finally {
      setIsCapturingPhoto(false);
    }
  }

  function handleAdvance(overridePhotoUri?: string | null) {
    if (subStep === 'qr') {
      if (!qrInput.trim()) return;
      setSubStep('photo');
      return;
    }

    const finalPhoto = overridePhotoUri !== undefined ? overridePhotoUri : photoUri;
    const newCaptures: Record<string, ItemCapture> = {
      ...captures,
      [currentItem.id]: { qrData: qrInput.trim(), photoUri: finalPhoto },
    };
    setCaptures(newCaptures);

    if (!isLastItem) {
      setStepIndex((i) => i + 1);
      setSubStep('qr');
      setQrInput('');
      setHasScanned(false);
      setPhotoUri(null);
    } else {
      const itemsWithCaptures = items.map((item) => ({
        ...item,
        qrData: newCaptures[item.id]?.qrData ?? '',
        photoUri: newCaptures[item.id]?.photoUri ?? null,
      }));
      router.push({
        pathname: '/(customer)/new-return/checkout',
        params: { items: JSON.stringify(itemsWithCaptures) },
      });
    }
  }

  function handleBack() {
    if (subStep === 'photo') {
      setSubStep('qr');
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      setSubStep('qr');
      setQrInput('');
      setHasScanned(false);
      setPhotoUri(null);
      return;
    }
    router.back();
  }

  // ── Permission loading ────────────────────────────────────────────
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  // ── Permission denied ─────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { paddingTop: insets.top + Spacing.lg }]}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>
          Return Runner needs the camera to scan QR codes and photograph your packages.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.permBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.permBack}>
          <Text style={styles.permBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Full-screen camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={
          subStep === 'qr' ? { barcodeTypes: ['qr', 'code128', 'code39', 'pdf417'] } : undefined
        }
        onBarcodeScanned={subStep === 'qr' ? handleBarcodeScanned : undefined}
      />

      {/* Photo preview over camera */}
      {subStep === 'photo' && photoUri && (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* QR finder overlay */}
      {subStep === 'qr' && (
        <View style={styles.finderOverlay} pointerEvents="none">
          <View style={[styles.finder, hasScanned && styles.finderSuccess]}>
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
            {hasScanned && (
              <View style={styles.scannedOverlay}>
                <Text style={styles.scannedCheck}>✓</Text>
              </View>
            )}
          </View>
          <Text style={[styles.finderHint, hasScanned && styles.finderHintSuccess]}>
            {hasScanned ? 'Return code captured!' : 'Aim at the QR code on your return label'}
          </Text>
        </View>
      )}

      {/* Shutter button (photo sub-step, no photo yet) */}
      {subStep === 'photo' && !photoUri && (
        <View style={styles.shutterOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.shutterBtn, isCapturingPhoto && styles.shutterBtnBusy]}
            onPress={handleTakePhoto}
            disabled={isCapturingPhoto}
            activeOpacity={0.85}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Top header bar ──────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.xs }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>
            {subStep === 'qr' ? 'Scan Return Label' : 'Item Photo'}
          </Text>
          <View style={styles.progressDots}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === stepIndex
                    ? styles.progressDotActive
                    : i < stepIndex
                    ? styles.progressDotDone
                    : null,
                ]}
              />
            ))}
          </View>
        </View>

        <Text style={styles.stepCounter}>{stepIndex + 1}/{items.length}</Text>
      </View>

      {/* ── Bottom control sheet ─────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Item summary */}
        <Text style={styles.sheetItemName} numberOfLines={2}>
          {currentItem.itemName}
        </Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{currentItem.dropoffType.toUpperCase()}</Text>
          </View>
          {subStep === 'qr' && (
            <View style={[styles.chip, styles.chipSubstep]}>
              <Text style={styles.chipText}>SCAN QR</Text>
            </View>
          )}
          {subStep === 'photo' && (
            <View style={[styles.chip, styles.chipSubstepPhoto]}>
              <Text style={[styles.chipText, { color: Colors.primary }]}>PHOTO</Text>
            </View>
          )}
        </View>

        {/* QR sub-step controls */}
        {subStep === 'qr' && (
          <>
            <View style={[styles.qrBox, hasScanned && styles.qrBoxSuccess]}>
              <Text style={styles.qrBoxLabel}>RETURN CODE</Text>
              <TextInput
                style={styles.qrBoxInput}
                value={qrInput}
                onChangeText={(v) => {
                  setQrInput(v);
                  if (hasScanned) setHasScanned(false);
                }}
                placeholder="Scanning…"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              {hasScanned && <Text style={styles.qrBoxCheck}>✓</Text>}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, !qrInput.trim() && styles.primaryBtnDisabled]}
              onPress={() => handleAdvance()}
              disabled={!qrInput.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Next: Item Photo →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Photo sub-step controls */}
        {subStep === 'photo' && (
          <>
            {photoUri ? (
              <>
                <Text style={styles.photoStatus}>Photo captured ✓</Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => handleAdvance()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>
                    {isLastItem ? 'Review Order →' : `Next Item (${stepIndex + 2}/${items.length}) →`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setPhotoUri(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryBtnText}>Retake Photo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.photoHint}>
                  Tap the shutter button to photograph the item.
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleTakePhoto}
                  disabled={isCapturingPhoto}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => handleAdvance(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryBtnText}>
                    {isLastItem ? 'Skip photo & review order' : 'Skip photo & next item'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const FINDER_SIZE = 220;
const CORNER_LEN = 28;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Permission screen
  permRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  permTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  permSub: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  permBtnText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: '#fff',
  },
  permBack: {
    paddingVertical: Spacing.sm,
  },
  permBackText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.primary,
  },

  // Top header bar (over camera)
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn: {
    width: 36,
    paddingTop: 2,
  },
  backText: {
    fontFamily: FontFamily.medium,
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  headerMid: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  headerTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    color: '#fff',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 6,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressDotActive: {
    backgroundColor: '#fff',
    width: 18,
    borderRadius: 3,
  },
  progressDotDone: {
    backgroundColor: Colors.success,
  },
  stepCounter: {
    width: 36,
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
    paddingTop: 4,
  },

  // QR finder overlay
  finderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 240,
  },
  finder: {
    width: FINDER_SIZE,
    height: FINDER_SIZE,
    position: 'relative',
  },
  finderSuccess: {},
  corner: {
    position: 'absolute',
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: '#fff',
    borderWidth: 3,
  },
  cTL: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 6,
  },
  cTR: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 6,
  },
  cBL: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 6,
  },
  cBR: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 6,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46,139,87,0.2)',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedCheck: {
    fontSize: 52,
    color: Colors.success,
  },
  finderHint: {
    marginTop: 20,
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  finderHintSuccess: {
    color: '#6EE7A0',
    fontFamily: FontFamily.semiBold,
  },

  // Shutter overlay
  shutterOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 280,
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBtnBusy: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },

  // Bottom sheet (over camera)
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sheetItemName: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.background,
  },
  chipSubstep: {
    borderColor: Colors.warning,
    backgroundColor: '#FFF8ED',
  },
  chipSubstepPhoto: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF3FA',
  },
  chipText: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.3,
    color: Colors.textSecondary,
  },

  // QR input
  qrBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    backgroundColor: Colors.background,
    gap: 10,
  },
  qrBoxSuccess: {
    borderColor: Colors.success,
    backgroundColor: '#EDF7F1',
  },
  qrBoxLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: Colors.textSecondary,
  },
  qrBoxInput: {
    flex: 1,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  qrBoxCheck: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.success,
  },

  // Photo sub-step
  photoStatus: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Colors.success,
    textAlign: 'center',
  },
  photoHint: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.35,
  },
  primaryBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.primary,
  },
});
