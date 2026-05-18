import { useRef } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { Colors, FontFamily } from '@/lib/theme';

const THUMB = 56;
const PAD = 4;
const TRACK_H = THUMB + PAD * 2;

interface SlideToConfirmProps {
  label: string;
  disabledLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  color?: string;
}

export function SlideToConfirm({
  label,
  disabledLabel,
  disabled = false,
  onConfirm,
  color = Colors.success,
}: SlideToConfirmProps) {
  const trackW = useRef(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const maxX = () => Math.max(0, trackW.current - THUMB - PAD * 2);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !confirmedRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current && !confirmedRef.current,
      onPanResponderMove: (_, gs) => {
        slideX.setValue(Math.max(0, Math.min(maxX(), gs.dx)));
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx >= maxX() * 0.8) {
          Animated.spring(slideX, {
            toValue: maxX(),
            useNativeDriver: false,
            bounciness: 0,
            speed: 20,
          }).start(() => {
            confirmedRef.current = true;
            onConfirm();
          });
        } else {
          Animated.spring(slideX, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 8,
          }).start();
        }
      },
    }),
  ).current;

  const labelOpacity = slideX.interpolate({
    inputRange: [0, 70],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        styles.track,
        disabled
          ? styles.trackDisabled
          : { borderColor: `${color}60`, backgroundColor: `${color}12` },
      ]}
      onLayout={(e) => {
        trackW.current = e.nativeEvent.layout.width;
      }}
    >
      {/* Expanding fill behind thumb */}
      {!disabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              backgroundColor: `${color}22`,
              // @ts-ignore — Animated.Value works at runtime for layout props
              width: Animated.add(slideX, THUMB + PAD * 2),
            },
          ]}
        />
      )}

      {/* Label */}
      <Animated.Text
        style={[
          styles.label,
          {
            opacity: labelOpacity,
            color: disabled ? Colors.textSecondary : color,
          },
        ]}
      >
        {disabled ? (disabledLabel ?? label) : label}
      </Animated.Text>

      {/* Thumb */}
      <Animated.View
        style={[
          styles.thumb,
          disabled
            ? styles.thumbDisabled
            : { backgroundColor: color },
          {
            // @ts-ignore — Animated.Value works at runtime
            transform: [{ translateX: disabled ? 0 : slideX }],
          },
        ]}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        <Text style={[styles.arrow, disabled && styles.arrowDisabled]}>›</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
    overflow: 'hidden',
    position: 'relative',
  },
  trackDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily.bold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  thumb: {
    position: 'absolute',
    left: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbDisabled: {
    backgroundColor: Colors.border,
  },
  arrow: {
    fontSize: 30,
    color: '#fff',
    lineHeight: 34,
    marginLeft: 4,
  },
  arrowDisabled: {
    color: Colors.textSecondary,
  },
});
