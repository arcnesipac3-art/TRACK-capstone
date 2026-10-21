/**
 * Shared notices screen — announcements + notifications in two segments.
 *
 * Used by every role (student/parent: read-only; teacher/admin: can also post
 * announcements and pick a target audience/section — the backend validates
 * that a teacher may only target sections they actually teach).
 *
 * Announcements are read from the list endpoint only: the detail endpoint is
 * admin/teacher-write scoped, and the list already carries the full body.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import ScreenList from './ScreenList';
import { Picker } from '@react-native-picker/picker';

import { colors, spacing, radius, typography, tones } from '../theme';
import { api, ApiError, type SessionUser } from '../api/client';
import type {
  Announcement,
  AnnouncementAudience,
  Notification,
  Section,
  TeacherAssignment,
} from '../api/types';
import { EmptyState, ErrorState, LoadingState } from './StateViews';
import AppHeader from './ui/AppHeader';
import Button from './ui/Button';
import SegmentedControl from './ui/SegmentedControl';

type Segment = 'announcements' | 'notifications';

type Props = {
  /** true for teacher/admin — enables the compose form. */
  canPost?: boolean;
  initialSegment?: Segment;
};

const AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
];

const SEGMENT_OPTIONS: { label: string; value: Segment }[] = [
  { label: 'Announcements', value: 'announcements' },
  { label: 'Notifications', value: 'notifications' },
];

export default function NoticesScreen({ canPost = false, initialSegment = 'notifications' }: Props) {
  const [segment, setSegment] = useState<Segment>(initialSegment);

  return (
    <View style={styles.root}>
      <AppHeader title="Notices" subtitle="School announcements and updates for you." />
      <View style={styles.segments}>
        <SegmentedControl options={SEGMENT_OPTIONS} value={segment} onChange={setSegment} />
      </View>

      {segment === 'announcements' ? (
        <AnnouncementsTab canPost={canPost} />
      ) : (
        <NotificationsTab />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

function AnnouncementsTab({ canPost }: { canPost: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compose state (staff only)
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sections, setSections] = useState<{ id: number; label: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [section, setSection] = useState<string>(''); // '' = school-wide
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<Announcement>('/announcements/', {
        params: { ordering: '-is_pinned,-published_at,-created_at' },
      });
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load announcements.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  useEffect(() => {
    if (!canPost) return;
    let active = true;
    (async () => {
      try {
        const me = await api.me();
        if (!active) return;
        setUser(me);
        // A teacher may only target sections they teach (backend-enforced);
        // an admin may target any section.
        if (me.role === 'teacher') {
          const assignments = await api.list<TeacherAssignment>('/teacher-assignments/');
          if (!active) return;
          const unique = new Map<number, string>();
          assignments.forEach((a) => unique.set(a.section, a.section_name));
          setSections([...unique].map(([id, label]) => ({ id, label })));
        } else {
          const list = await api.list<Section>('/sections/');
          if (!active) return;
          setSections(list.map((s) => ({ id: s.id, label: `${s.grade_level_name} — ${s.name}` })));
        }
      } catch {
        // Section picker falls back to school-wide; posting still works.
      }
    })();
    return () => {
      active = false;
    };
  }, [canPost]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handlePost = async () => {
    setPostError(null);
    setPosted(null);
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setPostError('Both a title and a message are required.');
      return;
    }
    setPosting(true);
    try {
      await api.post('/announcements/', {
        title: trimmedTitle,
        body: trimmedBody,
        audience,
        section: section ? Number(section) : null,
        is_pinned: false,
      });
      setTitle('');
      setBody('');
      setAudience('all');
      setSection('');
      setPosted('Announcement posted.');
      setComposing(false);
      await load();
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : 'Could not post the announcement.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <LoadingState label="Loading announcements…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.navy700]} />}
      keyboardShouldPersistTaps="handled"
    >
      {canPost && (
        <View style={styles.composeBox}>
          {!composing && !posted ? (
            <TouchableOpacity
              style={styles.composeOpen}
              onPress={() => setComposing(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.composeOpenLabel}>Post an announcement</Text>
            </TouchableOpacity>
          ) : null}

          {posted && !composing && (
            <Text style={styles.postedText}>{posted}</Text>
          )}

          {composing && (
            <View style={styles.composeForm}>
              <Text style={styles.composeTitle}>New announcement</Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="School announcement title"
                placeholderTextColor={colors.textSubtle}
                maxLength={200}
              />

              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={body}
                onChangeText={setBody}
                placeholder="Write the announcement…"
                placeholderTextColor={colors.textSubtle}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Audience</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={audience}
                  onValueChange={(v: string) => setAudience(v as AnnouncementAudience)}
                  style={styles.picker}
                >
                  {AUDIENCES.map((a) => (
                    <Picker.Item key={a.value} value={a.value} label={a.label} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Section (optional)</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={section}
                  onValueChange={(v: string) => setSection(v)}
                  style={styles.picker}
                >
                  <Picker.Item value="" label={user?.role === 'admin' ? 'School-wide' : 'School-wide (or pick your section)'} />
                  {sections.map((s) => (
                    <Picker.Item key={s.id} value={String(s.id)} label={s.label} />
                  ))}
                </Picker>
              </View>

              {postError && <Text style={styles.errorText}>{postError}</Text>}

              <View style={styles.composeActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => { setComposing(false); setPostError(null); }}
                  disabled={posting}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onPress={handlePost} loading={posting}>
                  Post
                </Button>
              </View>
            </View>
          )}
        </View>
      )}

      {items.length === 0 ? (
        <EmptyState inline title="No announcements" body="School and class announcements will appear here." />
      ) : (
        <ScreenList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={(item) => <AnnouncementCard item={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScrollView>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const audienceLabel = AUDIENCES.find((a) => a.value === item.audience)?.label ?? item.audience;
  return (
    <View style={[styles.card, item.is_pinned && styles.cardPinned]}>
      <View style={styles.cardTop}>
        <View style={styles.grow}>
          <Text style={styles.cardTitle}>{item.title}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: tones.blue.background }]}>
          <Text style={[styles.badgeText, { color: tones.blue.text }]}>
            {item.is_pinned ? 'Pinned' : audienceLabel}
          </Text>
        </View>
      </View>
      <Text style={styles.cardBody}>{item.body}</Text>
      <Text style={styles.cardMeta}>
        {item.author_name ?? 'TRACK'} · {formatDate(item.published_at ?? item.created_at)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsTab() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.list<Notification>('/notifications/');
      setItems(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const markRead = async (id: number) => {
    setActionError(null);
    try {
      await api.post(`/notifications/${id}/read/`, {});
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not mark as read.');
    }
  };

  const markAllRead = async () => {
    setActionError(null);
    try {
      await api.post('/notifications/read-all/', {});
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not mark all as read.');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) return <LoadingState label="Loading notifications…" />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.navy700]} />}
    >
      {unread > 0 && (
        <TouchableOpacity
          style={styles.markAll}
          onPress={markAllRead}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={styles.markAllLabel}>Mark all {unread} as read</Text>
        </TouchableOpacity>
      )}

      {actionError && <Text style={styles.errorText}>{actionError}</Text>}

      {items.length === 0 ? (
        <EmptyState inline title="No notifications" body="You're all caught up." />
      ) : (
        <ScreenList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={(item) => (
            <TouchableOpacity
              style={[styles.card, !item.is_read && styles.cardUnread]}
              onPress={() => !item.is_read && markRead(item.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <View style={styles.cardTop}>
                <View style={styles.grow}>
                  <Text style={[styles.cardTitle, !item.is_read && styles.unreadTitle]}>{item.title}</Text>
                  <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
                </View>
                <Text style={styles.cardMetaInline}>{formatRelative(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 6e4);
  const hours = Math.floor(diff / 36e5);
  const days = Math.floor(diff / 864e5);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segments: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  composeBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  composeOpen: {
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  composeOpenLabel: { ...typography.buttonText, color: colors.onNavy, fontSize: 15 },
  composeForm: { gap: spacing.xs },
  composeTitle: { ...typography.heading, color: colors.navy900, marginBottom: spacing.xs },
  postedText: { ...typography.muted, color: colors.green700 },
  fieldLabel: { ...typography.label, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
  },
  multiline: { minHeight: 96 },
  pickerWrapper: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 4,
    overflow: 'hidden',
  },
  picker: { height: 44, color: colors.text },
  errorText: { ...typography.muted, color: colors.red700, marginTop: spacing.sm },
  composeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  markAll: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  markAllLabel: { ...typography.label, color: colors.navy700 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardPinned: { borderColor: colors.blue700, borderWidth: 1.5 },
  cardUnread: { backgroundColor: colors.blue50 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  cardTitle: { ...typography.heading, color: colors.text },
  unreadTitle: { fontWeight: '700' },
  cardBody: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  cardMeta: { ...typography.subtle, marginTop: spacing.xs },
  cardMetaInline: { ...typography.subtle, marginLeft: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  separator: { height: 1 },
});
