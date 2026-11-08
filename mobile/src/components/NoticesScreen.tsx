/**
 * TRACK — Notices: what the school is telling everyone, and what happened to you.
 *
 * Two different questions, which is why they share a screen and not a list. An
 * announcement is a broadcast — pinned ones stay at the top and the body is the point. A
 * notification is about *your* record, it goes stale the moment it is read, and its type
 * (a deadline, an absence, an enrollment decision) is the first thing you need to know.
 *
 * The lists live in one place so the segment labels can carry numbers: a count on
 * Announcements is a volume, a count on Notifications is unread work. The same reason
 * puts a rail down a pinned notice and a dot beside an unread row — the state an item is
 * in has to be legible before you read it.
 *
 * Posting stays a staff action and moves into a sheet. It used to be a form that grew
 * inside the list, pushing every announcement down as soon as the button was pressed;
 * a sheet writes the announcement without moving the page behind it.
 */
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, toneHue, touch, typography, type Tone } from '../theme';
import { api, ApiError, type SessionUser } from '../api/client';
import { countNoun, formatRelativeTime } from '../format';
import type {
  Announcement,
  AnnouncementAudience,
  Notification,
  Section,
  TeacherAssignment,
} from '../api/types';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from './StateViews';
import AppHeader from './ui/AppHeader';
import Button from './ui/Button';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Dropdown from './ui/Dropdown';
import Fab from './ui/Fab';
import Field from './ui/Field';
import ListRow from './ui/ListRow';
import Screen from './ui/Screen';
import SectionHeader from './ui/SectionHeader';
import SegmentedControl from './ui/SegmentedControl';
import Sheet from './ui/Sheet';
import { useToast } from './ui/Toast';

type Segment = 'announcements' | 'notifications';

type Props = {
  /** true for teacher/admin — enables the compose sheet. */
  canPost?: boolean;
  initialSegment?: Segment;
};

type Glyph = ComponentProps<typeof Ionicons>['name'];

const AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'parents', label: 'Parents' },
];

/**
 * The notification's type decides what the row means, so it decides the mark on the left.
 * An unmapped type still gets a row — a bell and a quiet grey — rather than vanishing.
 */
const NOTIF_MARKS: Record<string, { icon: Glyph; tone: Tone; label: string }> = {
  requirement_new: { icon: 'clipboard-outline', tone: 'blue', label: 'New requirement' },
  deadline_approaching: { icon: 'time-outline', tone: 'amber', label: 'Deadline approaching' },
  overdue: { icon: 'alert-circle-outline', tone: 'red', label: 'Overdue' },
  submission_verified: { icon: 'checkmark-circle-outline', tone: 'green', label: 'Verified' },
  submission_returned: { icon: 'refresh-outline', tone: 'amber', label: 'Returned for revision' },
  attendance_absent: { icon: 'person-remove-outline', tone: 'red', label: 'Marked absent' },
  attendance_late: { icon: 'alarm-outline', tone: 'amber', label: 'Marked late' },
  announcement: { icon: 'megaphone-outline', tone: 'navy', label: 'Announcement' },
  enrollment_submitted: { icon: 'document-text-outline', tone: 'blue', label: 'Application submitted' },
  enrollment_corrections: { icon: 'create-outline', tone: 'amber', label: 'Corrections requested' },
  enrollment_decision: { icon: 'scale-outline', tone: 'violet', label: 'Application decision' },
  enrollment_confirmed: { icon: 'school-outline', tone: 'green', label: 'Enrollment confirmed' },
  message_received: { icon: 'chatbubble-ellipses-outline', tone: 'teal', label: 'New message' },
};

const FALLBACK_MARK: { icon: Glyph; tone: Tone; label: string } = {
  icon: 'notifications-outline',
  tone: 'gray',
  label: 'Notification',
};

/** Bodies longer than this are folded; shorter ones get no affordance to tap. */
const FOLD_AT = 180;

export default function NoticesScreen({ canPost = false, initialSegment = 'notifications' }: Props) {
  const toast = useToast();
  const [segment, setSegment] = useState<Segment>(initialSegment);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [annError, setAnnError] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Compose (staff only)
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sections, setSections] = useState<{ id: number; label: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [section, setSection] = useState<string>(''); // '' = school-wide
  const [posting, setPosting] = useState(false);
  const [touched, setTouched] = useState(false);

  const load = useCallback(async () => {
    // One pull refreshes both lists: the segment badges claim numbers about each of
    // them, and a badge that only updates when you visit is a badge nobody trusts.
    const [ann, notif] = await Promise.allSettled([
      api.list<Announcement>('/announcements/', {
        params: { ordering: '-is_pinned,-published_at,-created_at' },
      }),
      api.list<Notification>('/notifications/'),
    ]);
    if (ann.status === 'fulfilled') {
      setAnnouncements(ann.value);
      setAnnError(null);
    } else {
      setAnnouncements([]);
      setAnnError(reason(ann.reason, 'Could not load announcements.'));
    }
    if (notif.status === 'fulfilled') {
      setNotifications(notif.value);
      setNotifError(null);
    } else {
      setNotifications([]);
      setNotifError(reason(notif.reason, 'Could not load notifications.'));
    }
    setLoading(false);
    setRefreshing(false);
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

  const unread = notifications.filter((n) => !n.is_read).length;

  const openCompose = () => {
    setTouched(false);
    setComposing(true);
  };

  const handlePost = async () => {
    setTouched(true);
    if (!title.trim() || !body.trim()) return;
    setPosting(true);
    try {
      await api.post('/announcements/', {
        title: title.trim(),
        body: body.trim(),
        audience,
        section: section ? Number(section) : null,
        is_pinned: false,
      });
      setTitle('');
      setBody('');
      setAudience('all');
      setSection('');
      setTouched(false);
      setComposing(false);
      toast.success('Announcement posted');
      await load();
    } catch (err) {
      toast.error('Could not post', reason(err, 'The announcement was not saved.'));
    } finally {
      setPosting(false);
    }
  };

  const markRead = async (id: number) => {
    // The row clears as it is tapped and puts its dot back if the server disagrees;
    // a notification that stays marked until the next pull reads as a broken tap.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await api.post(`/notifications/${id}/read/`, {});
    } catch (err) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
      toast.error('Still unread', reason(err, 'The notification could not be marked as read.'));
    }
  };

  const markAllRead = async () => {
    const snapshot = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await api.post('/notifications/read-all/', {});
      toast.success('All caught up');
    } catch (err) {
      setNotifications(snapshot);
      toast.error('Nothing marked', reason(err, 'The notifications could not be cleared.'));
    }
  };

  // '' is a real option, not an empty selection: it means "no section", which
  // the backend reads as a school-wide announcement.
  const sectionOptions = [
    {
      value: '',
      label: user?.role === 'admin' ? 'School-wide' : 'School-wide (or pick your section)',
    },
    ...sections.map((s) => ({ value: String(s.id), label: s.label })),
  ];

  const bar = <AppHeader title="Notices" subtitle="School announcements and updates for you." />;

  if (loading) {
    return (
      <Screen header={bar}>
        <LoadingState label="Loading notices…" rows={5} />
      </Screen>
    );
  }

  const failed = segment === 'announcements' ? annError : notifError;
  const active = segment === 'announcements' ? announcements : notifications;

  if (failed && active.length === 0) {
    return (
      <Screen header={bar}>
        <ErrorState
          message={failed}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={bar} animationKey={segment}>
      <View style={styles.frame}>
        <View style={styles.switcher}>
          <SegmentedControl
            options={[
              {
                label: 'Announcements',
                value: 'announcements' as Segment,
                count: announcements.length,
              },
              {
                label: 'Notifications',
                value: 'notifications' as Segment,
                count: unread > 0 ? unread : undefined,
              },
            ]}
            value={segment}
            onChange={setSegment}
          />
        </View>

        <ScrollView
          contentContainerStyle={
            canPost && segment === 'announcements' ? styles.contentTall : styles.content
          }
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              colors={[colors.blue]}
              tintColor={colors.blue}
            />
          }
        >
          {failed ? <ErrorBanner message={failed} onRetry={load} /> : null}

          {segment === 'announcements' ? (
            <AnnouncementsBlock items={announcements} canPost={canPost} onCompose={openCompose} />
          ) : (
            <NotificationsBlock items={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
          )}
        </ScrollView>

        {canPost && segment === 'announcements' ? (
          <Fab
            floating
            icon="create"
            tone="brand"
            accessibilityLabel="Post an announcement"
            testID="notices-post-fab"
            onPress={openCompose}
          />
        ) : null}
      </View>

      <Sheet
        visible={composing}
        onClose={() => setComposing(false)}
        title="New announcement"
        subtitle="Everyone in the audience sees it as soon as you post."
        size="tall"
        footer={
          <>
            <Button variant="secondary" onPress={() => setComposing(false)} disabled={posting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              block
              loading={posting}
              onPress={handlePost}
              testID="notices-post-submit"
            >
              Post
            </Button>
          </>
        }
      >
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="What the school needs to know"
          error={touched && !title.trim() ? 'A title is required.' : undefined}
          inputProps={{ maxLength: 200, autoCapitalize: 'sentences' }}
        />
        <Field
          label="Message"
          value={body}
          onChangeText={setBody}
          placeholder="Write the announcement…"
          multiline
          minLines={5}
          error={touched && !body.trim() ? 'The message cannot be empty.' : undefined}
        />
        <Dropdown<AnnouncementAudience>
          label="Audience"
          options={AUDIENCES}
          value={audience}
          onChange={setAudience}
        />
        <Dropdown<string> label="Section" options={sectionOptions} value={section} onChange={setSection} />
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Announcements                                                       */
/* ------------------------------------------------------------------ */

type AnnFilter = { kind: 'all' } | { kind: 'pinned' } | { kind: 'audience'; value: AnnouncementAudience };

function AnnouncementsBlock({
  items,
  canPost,
  onCompose,
}: {
  items: Announcement[];
  canPost: boolean;
  onCompose: () => void;
}) {
  const [filter, setFilter] = useState<AnnFilter>({ kind: 'all' });
  const [expanded, setExpanded] = useState<number | null>(null);

  const pinnedCount = items.filter((a) => a.is_pinned).length;
  // An audience only earns a filter once something has actually been posted to it.
  const audiences = AUDIENCES.filter((a) => items.some((item) => item.audience === a.value));

  const visible = items.filter((item) => {
    if (filter.kind === 'pinned') return item.is_pinned;
    if (filter.kind === 'audience') return item.audience === filter.value;
    return true;
  });

  if (items.length === 0) {
    return (
      <EmptyState
        inline
        icon="megaphone-outline"
        title="No announcements yet"
        body={
          canPost
            ? 'The first one you post appears here, pinned ones on top.'
            : 'School and class announcements will appear here.'
        }
        actionLabel={canPost ? 'Post an announcement' : undefined}
        onAction={canPost ? onCompose : undefined}
      />
    );
  }

  return (
    <View style={styles.block}>
      {pinnedCount > 0 || audiences.length > 1 ? (
        <View style={styles.filters}>
          <Chip
            label="All"
            count={items.length}
            selected={filter.kind === 'all'}
            onPress={() => setFilter({ kind: 'all' })}
          />
          {pinnedCount > 0 ? (
            <Chip
              label="Pinned"
              count={pinnedCount}
              icon="pin-outline"
              selected={filter.kind === 'pinned'}
              onPress={() => setFilter({ kind: 'pinned' })}
            />
          ) : null}
          {audiences.map((a) => (
            <Chip
              key={a.value}
              label={a.label}
              count={items.filter((item) => item.audience === a.value).length}
              selected={filter.kind === 'audience' && filter.value === a.value}
              onPress={() => setFilter({ kind: 'audience', value: a.value })}
            />
          ))}
        </View>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          inline
          icon="folder-open-outline"
          title="Nothing in this filter"
          body="Try All — the announcement is probably addressed somewhere else."
        />
      ) : (
        visible.map((item) => (
          <AnnouncementCard
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
          />
        ))
      )}
    </View>
  );
}

function AnnouncementCard({
  item,
  expanded,
  onToggle,
}: {
  item: Announcement;
  expanded: boolean;
  onToggle: () => void;
}) {
  const audience = AUDIENCES.find((a) => a.value === item.audience)?.label ?? item.audience;
  const long = item.body.length > FOLD_AT;

  return (
    <Card style={item.is_pinned ? styles.pinned : null}>
      {item.is_pinned ? (
        <View style={styles.pinRow}>
          <Ionicons name="pin-outline" size={13} color={colors.amberText} />
          <Text style={styles.pinLabel}>Pinned</Text>
        </View>
      ) : null}

      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardWhen}>{formatRelativeTime(item.published_at ?? item.created_at)}</Text>
      </View>

      <Text style={styles.cardBody} numberOfLines={long && !expanded ? 4 : undefined}>
        {item.body}
      </Text>

      {long ? (
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          style={({ pressed }) => [styles.foldToggle, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse the announcement' : 'Read the whole announcement'}
        >
          <Text style={styles.foldLabel}>{expanded ? 'Show less' : 'Read more'}</Text>
        </Pressable>
      ) : null}

      <Text style={styles.cardMeta}>{`${item.author_name ?? 'TRACK'} · ${audience}`}</Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsBlock({
  items,
  onMarkRead,
  onMarkAllRead,
}: {
  items: Notification[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}) {
  const [onlyUnread, setOnlyUnread] = useState(false);

  const unread = items.filter((n) => !n.is_read).length;
  const visible = onlyUnread ? items.filter((n) => !n.is_read) : items;

  if (items.length === 0) {
    return (
      <EmptyState
        inline
        icon="notifications-off-outline"
        title="Nothing to catch up on"
        body="Notifications about your record — deadlines, submissions, attendance — land here."
      />
    );
  }

  return (
    <View style={styles.block}>
      <SectionHeader
        title="Your notifications"
        count={visible.length}
        detail={unread > 0 ? countNoun(unread, 'unread item') : 'All read'}
        actionLabel={unread > 0 ? 'Mark all read' : undefined}
        onAction={unread > 0 ? onMarkAllRead : undefined}
      />

      <View style={styles.filters}>
        <Chip label="Everything" selected={!onlyUnread} onPress={() => setOnlyUnread(false)} />
        <Chip label="Unread" count={unread} selected={onlyUnread} onPress={() => setOnlyUnread(true)} />
      </View>

      {visible.length === 0 ? (
        <EmptyState
          inline
          icon="checkmark-done-outline"
          title="Nothing unread"
          body="Every notification here has been opened."
        />
      ) : (
        <Card padded={false}>
          {visible.map((item, index) => {
            const mark = NOTIF_MARKS[item.notif_type] ?? FALLBACK_MARK;
            return (
              <ListRow
                key={item.id}
                title={item.title}
                subtitle={item.body}
                detail={mark.label}
                icon={mark.icon}
                tone={mark.tone}
                divider={index < visible.length - 1}
                chevron={false}
                onPress={item.is_read ? undefined : () => onMarkRead(item.id)}
                trailing={<UnreadMark read={item.is_read} when={formatRelativeTime(item.created_at)} />}
                style={item.is_read ? null : styles.unreadRow}
              />
            );
          })}
        </Card>
      )}
    </View>
  );
}

/** The time is the fact and the dot is the state; both live on the right, where the eye checks. */
function UnreadMark({ read, when }: { read: boolean; when: string }) {
  return (
    <View style={styles.mark}>
      <Text style={[styles.markTime, read ? null : styles.markTimeUnread]}>{when}</Text>
      {read ? null : <View style={styles.dot} />}
    </View>
  );
}

function reason(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  switcher: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  /** Room for the floating action, so the last notice is never under it. */
  contentTall: { padding: spacing.lg, paddingBottom: spacing.xxxl * 3, gap: spacing.md },
  block: { gap: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pinned: { borderLeftWidth: 3, borderLeftColor: colors.gold },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  pinLabel: { ...typography.micro, color: colors.amberText },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { ...typography.subhead, flex: 1, minWidth: 0 },
  cardWhen: { ...typography.subtle, color: colors.textSubtle, flexShrink: 0, paddingTop: 2 },
  cardBody: { ...typography.muted, color: colors.textMuted },
  foldToggle: { alignSelf: 'flex-start', minHeight: touch.inline },
  foldLabel: { ...typography.buttonText, fontSize: 13, color: colors.blueText },
  pressed: { opacity: 0.6 },
  cardMeta: { ...typography.subtle, color: colors.textSubtle },
  unreadRow: { backgroundColor: colors.blueWash },
  mark: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 0 },
  markTime: { ...typography.subtle, color: colors.textSubtle },
  markTimeUnread: { ...typography.micro, color: colors.blueText },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: toneHue.blue },
});
