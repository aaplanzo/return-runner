import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type DropoffType =
  | 'UPS Store'
  | 'USPS'
  | "Kohl's"
  | 'Amazon Hub Locker'
  | 'Whole Foods';

type AmazonOrder = {
  id: string;
  orderId: string;
  itemName: string;
  orderDate: string; // ISO date
  dropoffType: DropoffType;
  noBoxNeeded: boolean;
};

// ─── Mock data ───────────────────────────────────────────────────────────────
// Replaced by Amazon API response once the OAuth integration is live.

const MOCK_ORDERS: AmazonOrder[] = [
  {
    id: '1',
    orderId: '113-4521890-3892456',
    itemName: 'Anker 313 USB-C Wireless Charging Pad',
    orderDate: '2025-05-10',
    dropoffType: 'UPS Store',
    noBoxNeeded: true,
  },
  {
    id: '2',
    orderId: '114-9823456-7123890',
    itemName: 'Sony WH-1000XM5 Noise Cancelling Headphones',
    orderDate: '2025-05-08',
    dropoffType: 'USPS',
    noBoxNeeded: true,
  },
  {
    id: '3',
    orderId: '112-3345678-5561234',
    itemName: 'LEGO Technic McLaren Formula E Set (42169)',
    orderDate: '2025-05-05',
    dropoffType: "Kohl's",
    noBoxNeeded: false,
  },
  {
    id: '4',
    orderId: '113-7812345-6234567',
    itemName: 'Ninja Air Fryer AF101, 4 Qt Black',
    orderDate: '2025-04-28',
    dropoffType: 'Amazon Hub Locker',
    noBoxNeeded: false,
  },
  {
    id: '5',
    orderId: '114-5566778-8990011',
    itemName: 'Amazon Kindle Paperwhite Fabric Cover',
    orderDate: '2025-04-22',
    dropoffType: 'UPS Store',
    noBoxNeeded: true,
  },
  {
    id: '6',
    orderId: '111-2233445-6677889',
    itemName: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker',
    orderDate: '2025-04-18',
    dropoffType: 'Whole Foods',
    noBoxNeeded: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function shortenOrderId(id: string): string {
  // Show last 9 chars: e.g. "…3892456"
  return `…${id.slice(-9)}`;
}

function continueLabel(count: number): string {
  if (count === 0) return 'Select items to continue';
  return `Continue with ${count} item${count === 1 ? '' : 's'}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DropoffChip({ type, noBox }: { type: DropoffType; noBox: boolean }) {
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.text}>
        {type}{noBox ? ' · no box' : ''}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.surface,
    marginTop: 8,
  },
  text: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
});

function OrderCard({
  order,
  selected,
  onToggle,
}: {
  order: AmazonOrder;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      {/* Selection indicator */}
      <View style={[styles.circle, selected && styles.circleSelected]}>
        {selected && <Text style={styles.circleCheck}>✓</Text>}
      </View>

      {/* Content */}
      <View style={styles.cardBody}>
        <Text style={styles.itemName} numberOfLines={2}>
          {order.itemName}
        </Text>
        <Text style={styles.orderMeta}>
          {shortenOrderId(order.orderId)}
          {'  ·  '}
          {formatDate(order.orderDate)}
        </Text>
        <DropoffChip type={order.dropoffType} noBox={order.noBoxNeeded} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Not-connected empty state ────────────────────────────────────────────────

function NotConnectedState() {
  return (
    <View style={styles.emptyRoot}>
      <View style={styles.emptyIconBox}>
        <Text style={styles.emptyIcon}>📦</Text>
      </View>
      <Text style={styles.emptyTitle}>Connect your Amazon account</Text>
      <Text style={styles.emptySubtitle}>
        Link Amazon to automatically see your recent orders here. No manual
        entry needed.
      </Text>
      <TouchableOpacity style={styles.connectButton} activeOpacity={0.85}>
        <Text style={styles.connectButtonText}>Connect Amazon</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.manualLink}
        onPress={() => router.push('/(customer)/new-return/confirm')}
        activeOpacity={0.6}
      >
        <Text style={styles.manualLinkText}>Enter items manually instead</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function SelectItems() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const isConnected = profile?.amazon_connected ?? false;

  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleContinue() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const items = MOCK_ORDERS.filter((o) => ids.includes(o.id)).map((o) => ({
      id: o.id,
      itemName: o.itemName,
      dropoffType: o.dropoffType,
      orderId: o.orderId,
    }));
    router.push({
      pathname: '/(customer)/new-return/confirm',
      params: { items: JSON.stringify(items) },
    });
  }

  const BOTTOM_BAR_HEIGHT = 80 + insets.bottom;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>New Return</Text>

        {/* right-side spacer to center the title */}
        <View style={styles.backButton} />
      </View>

      {isConnected ? (
        <>
          {/* ── Connected: order list ───────────────────────── */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: BOTTOM_BAR_HEIGHT + Spacing.md },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Section label + stats */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Recent Amazon orders</Text>
              {selected.size > 0 && (
                <Text style={styles.selectedStat}>
                  {selected.size} selected
                </Text>
              )}
            </View>

            <View style={styles.cardList}>
              {MOCK_ORDERS.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={selected.has(order.id)}
                  onToggle={() => toggle(order.id)}
                />
              ))}
            </View>

            <Text style={styles.footNote}>
              Only return-eligible orders from the past 30 days are shown.
            </Text>
          </ScrollView>

          {/* ── Fixed bottom CTA ───────────────────────────── */}
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom + Spacing.sm },
            ]}
          >
            {selected.size > 0 && (
              <View style={styles.countRow}>
                <Text style={styles.countLabel}>Items selected</Text>
                <Text style={styles.countValue}>{selected.size}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.continueButton,
                selected.size === 0 && styles.continueButtonDisabled,
              ]}
              onPress={handleContinue}
              activeOpacity={0.85}
              disabled={selected.size === 0}
            >
              <Text style={styles.continueText}>{continueLabel(selected.size)}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* ── Not connected ──────────────────────────────────── */
        <NotConnectedState />
      )}
    </View>
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
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backButton: {
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

  // Section header row
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  selectedStat: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.primary,
  },

  // Card list
  cardList: {
    gap: Spacing.sm,
  },

  // Individual order card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF3FA',
  },

  // Selection circle
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  circleSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  circleCheck: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    color: Colors.surface,
    lineHeight: 14,
  },

  // Card content
  cardBody: {
    flex: 1,
  },
  itemName: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  orderMeta: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.3,
    color: Colors.textSecondary,
    marginTop: 5,
  },

  // Footnote
  footNote: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  countLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  countValue: {
    fontFamily: FontFamily.mono,
    fontSize: 18,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  continueButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 17,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.35,
  },
  continueText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.surface,
    letterSpacing: 0.2,
  },

  // Not-connected empty state
  emptyRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  connectButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 15,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: Spacing.sm,
  },
  connectButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.surface,
  },
  manualLink: {
    paddingVertical: Spacing.sm,
  },
  manualLinkText: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    color: Colors.primary,
    textAlign: 'center',
  },
});
