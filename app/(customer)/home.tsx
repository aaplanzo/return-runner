import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Colors, FontFamily, Radius, Spacing } from '@/lib/theme';
import type { Database, JobStatus } from '@/lib/database.types';

type Job = Database['public']['Tables']['jobs']['Row'];

const ACTIVE_STATUSES: JobStatus[] = ['pending', 'accepted', 'picked_up', 'dropped_off'];

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; bg: string }> = {
  pending:     { label: 'Finding a runner…', dot: Colors.warning,       bg: '#FFF8ED' },
  accepted:    { label: 'Runner on the way',      dot: Colors.primary,       bg: '#EEF3FA' },
  picked_up:   { label: 'Packages picked up',     dot: Colors.success,       bg: '#EDF7F1' },
  dropped_off: { label: 'Delivered to store',     dot: Colors.success,       bg: '#EDF7F1' },
  complete:    { label: 'Complete',               dot: Colors.success,       bg: '#EDF7F1' },
  cancelled:   { label: 'Cancelled',              dot: Colors.textSecondary, bg: Colors.background },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDay(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
  });
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return '—';
  return `$${amount.toFixed(2)}`;
}

function packageLabel(count: number | null): string {
  if (!count) return 'packages';
  return count === 1 ? '1 package' : `${count} packages`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ActiveBanner({ job }: { job: Job }) {
  const cfg = STATUS_CONFIG[job.status];

  return (
    <TouchableOpacity
      style={[styles.bannerCard, { backgroundColor: cfg.bg }]}
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/(customer)/job-detail', params: { id: job.id } })}
    >
      {/* Left accent strip */}
      <View style={[styles.bannerAccent, { backgroundColor: cfg.dot }]} />

      <View style={styles.bannerBody}>
        {/* Status row */}
        <View style={styles.bannerStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
          <Text style={[styles.bannerStatusText, { color: cfg.dot }]}>{cfg.label}</Text>
        </View>

        {/* Job summary */}
        <Text style={styles.bannerTitle}>
          {job.retailer ?? 'Return'} &middot; {packageLabel(job.package_count)}
        </Text>
        <Text style={styles.bannerMeta}>
          Submitted {timeAgo(job.created_at)}
        </Text>
      </View>

      {/* Chevron */}
      <Text style={styles.bannerChevron}>›</Text>
    </TouchableOpacity>
  );
}

function PastJobRow({ job }: { job: Job }) {
  const isComplete = job.status === 'complete';
  const total = (job.base_fare ?? 0) + job.tip_amount;

  return (
    <TouchableOpacity
      style={styles.pastRow}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/(customer)/job-detail', params: { id: job.id } })}
    >
      <View style={styles.pastRowLeft}>
        <Text style={styles.pastRowRetailer}>{job.retailer ?? 'Return'}</Text>
        <Text style={styles.pastRowMeta}>
          {packageLabel(job.package_count)} &middot; {formatDate(job.created_at)}
        </Text>
      </View>
      <View style={styles.pastRowRight}>
        <Text style={styles.pastRowAmount}>{formatCurrency(total || null)}</Text>
        <View style={[styles.pastRowBadge, !isComplete && styles.pastRowBadgeCancelled]}>
          <Text style={[styles.pastRowBadgeText, !isComplete && styles.pastRowBadgeTextCancelled]}>
            {isComplete ? 'Done' : 'Cancelled'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CustomerHome() {
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();

  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [pastJobs, setPastJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!profile?.id) return;

    const [activeRes, pastRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .eq('customer_id', profile.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('jobs')
        .select('*')
        .eq('customer_id', profile.id)
        .in('status', ['complete', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setActiveJob(activeRes.data ?? null);
    setPastJobs(pastRes.data ?? []);
    setIsLoading(false);
    setIsRefreshing(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchJobs();

    if (!profile?.id) return;
    const channel = supabase
      .channel(`jobs-customer-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `customer_id=eq.${profile.id}` },
        () => fetchJobs(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs, profile?.id]);

  function handleRefresh() {
    setIsRefreshing(true);
    fetchJobs();
  }

  // Bottom CTA height so ScrollView can scroll clear of it
  const BOTTOM_BAR_HEIGHT = 80 + insets.bottom;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: BOTTOM_BAR_HEIGHT + Spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Greeting ─────────────────────────────────────── */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingDate}>{formatDay()}</Text>
          <Text style={styles.greetingName}>
            {getGreeting()},{'\n'}
            {profile?.first_name ?? 'there'} 👋
          </Text>
        </View>

        {/* ── Active return ─────────────────────────────────── */}
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : activeJob ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Active return</Text>
            <ActiveBanner job={activeJob} />
          </View>
        ) : null}

        {/* ── Past returns ──────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Past returns</Text>

          {!isLoading && pastJobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No returns yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "New Return" below to schedule your first pickup.
              </Text>
            </View>
          ) : (
            <View style={styles.pastList}>
              {pastJobs.map((job, idx) => (
                <View key={job.id}>
                  <PastJobRow job={job} />
                  {idx < pastJobs.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Fixed bottom CTA ─────────────────────────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={styles.newReturnButton}
          activeOpacity={0.85}
          onPress={() => router.push('/(customer)/new-return/select-items')}
        >
          <Text style={styles.newReturnText}>+ New Return</Text>
        </TouchableOpacity>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Greeting
  greetingSection: {
    marginBottom: Spacing.xl,
  },
  greetingDate: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  greetingName: {
    fontFamily: FontFamily.bold,
    fontSize: 30,
    color: Colors.textPrimary,
    lineHeight: 38,
  },

  // Section headers
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

  // Loading
  loadingRow: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },

  // Active banner card
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  bannerAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  bannerBody: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  bannerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerStatusText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
  bannerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  bannerMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  bannerChevron: {
    fontFamily: FontFamily.regular,
    fontSize: 24,
    color: Colors.textSecondary,
    paddingRight: Spacing.md,
  },

  // Past returns list
  pastList: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  pastRowLeft: {
    flex: 1,
    gap: 4,
  },
  pastRowRetailer: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  pastRowMeta: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  pastRowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  pastRowAmount: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  pastRowBadge: {
    backgroundColor: '#EDF7F1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pastRowBadgeCancelled: {
    backgroundColor: Colors.background,
  },
  pastRowBadgeText: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    color: Colors.success,
  },
  pastRowBadgeTextCancelled: {
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },

  // Empty state
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Bottom CTA
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
  newReturnButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 17,
    alignItems: 'center',
  },
  newReturnText: {
    fontFamily: FontFamily.bold,
    fontSize: 16,
    color: Colors.surface,
    letterSpacing: 0.2,
  },
});
