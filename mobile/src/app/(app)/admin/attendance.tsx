/**
 * Admin "Classes" — the week's timetable and the attendance register.
 *
 * Both endpoints are read-only here: GET /schedules/ and GET
 * /attendance/sessions/. Session generation and schedule editing stay in the web
 * portal; this screen is for checking what is happening today.
 *
 * The timetable used to unroll every class of every day down one column, which is
 * a week of scrolling to reach Friday. It is now a week strip with one day's
 * classes under it, laid out as a bell schedule — time on the rail, class beside
 * it — and the register is grouped by day and filterable by status instead of
 * being twenty-two identical cards in a row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography, type Tone } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AttendanceSession, AttendanceStatus, ClassSchedule } from '../../../api/types';
import { animateLayout } from '../../../anim';
import {
  countNoun,
  formatDate,
  formatDateWithWeekday,
} from '../../../format';
import { hapticImpact } from '../../../haptics';
import { EmptyState, ErrorBanner, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Chip from '../../../components/ui/Chip';
import DaySelector from '../../../components/ui/DaySelector';
import ListRow from '../../../components/ui/ListRow';
import MetricsCard from '../../../components/ui/MetricsCard';
import ProgressBar from '../../../components/ui/ProgressBar';
import Screen from '../../../components/ui/Screen';
import SectionHeader from '../../../components/ui/SectionHeader';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import Sheet from '../../../components/ui/Sheet';

type Segment = 'timetable' | 'sessions';
type SessionFilter = 'all' | AttendanceSession['status'];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_STUBS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ------------------------------------------------------------------ */
/* Small readings of the API's own strings                             */
/* ------------------------------------------------------------------ */

/** `07:30:00` or `07:30` -> `07:30`. */
function hhmm(value: string | null | undefined): string {
  return value && value.length >= 5 ? value.slice(0, 5) : '—';
}

function minutesOf(value: string | null | undefined): number | null {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** `1h` / `45m` / `1h 30m` — the length of a period, printed under its start. */
function spanOf(start: string, end: string): string {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null || to <= from) return '';
  const total = to - from;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

/** `Grade 7 — Sampaguita (2026-2027)` -> `Grade 7 Sampaguita`. */
function sectionLabel(name: string): string {
  const parts = name.split('—');
  const grade = (parts.length > 1 ? parts[0] : '').trim();
  const core = (parts.length > 1 ? parts[1] : name).replace(/\s*\([^)]*\)\s*$/, '').trim();
  return [grade, core].filter(Boolean).join(' ');
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday, matching `day_of_week`. */
function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

/**
 * Subjects are the natural way to colour a timetable, and the API sends no subject
 * hue — so the palette is assigned by name and stays put between renders, screens
 * and reloads. `colors.chart` is the app's own series order.
 */
function subjectHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 1000003;
  return colors.chart[hash % colors.chart.length];
}

function sessionTone(status: AttendanceSession['status']): Tone {
  if (status === 'completed') return 'green';
  if (status === 'in_progress') return 'blue';
  return 'gray';
}

const MARK_TONE: Record<AttendanceStatus, Tone> = {
  present: 'green',
  absent: 'red',
  late: 'amber',
  excused: 'blue',
};

/** Present/absent/late/excused counted out of the marks the session already holds. */
function tally(session: AttendanceSession) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  session.records.forEach((record) => {
    if (record.status === 'present') counts.present += 1;
    else if (record.status === 'absent') counts.absent += 1;
    else if (record.status === 'late') counts.late += 1;
    else if (record.status === 'excused') counts.excused += 1;
  });
  return { ...counts, total: session.records.length };
}

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

export default function AdminClassesScreen() {
  const [segment, setSegment] = useState<Segment>('timetable');
  const [day, setDay] = useState(() => isoWeekday(new Date()));
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [openSlot, setOpenSlot] = useState<ClassSchedule | null>(null);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sched, sess] = await Promise.all([
        api.list<ClassSchedule>('/schedules/'),
        api.list<AttendanceSession>('/attendance/sessions/'),
      ]);
      setSchedules(sched);
      setSessions(sess);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load classes.');
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

  /** Classes per weekday, so the strip can dot the days that hold something. */
  const dayCounts = useMemo(() => {
    const map = new Map<number, number>();
    schedules.forEach((slot) => map.set(slot.day_of_week, (map.get(slot.day_of_week) ?? 0) + 1));
    return map;
  }, [schedules]);

  /** The seven days of this week, dated, with today and busy days marked. */
  const week = useMemo(() => {
    const now = new Date();
    const todayIso = isoWeekday(now);
    const monday = new Date(now);
    monday.setDate(now.getDate() - (todayIso - 1));
    return DAY_STUBS.map((short, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return {
        value: index + 1,
        short,
        date: date.getDate(),
        hasContent: (dayCounts.get(index + 1) ?? 0) > 0,
        isToday: index + 1 === todayIso,
        dayDate: date,
      };
    });
  }, [dayCounts]);

  const slotsForDay = useMemo(
    () =>
      schedules
        .filter((slot) => slot.day_of_week === day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [schedules, day]
  );

  /**
   * The nearest day that actually holds classes, so an empty Wednesday still has a
   * way forward on the screen instead of dead air.
   */
  const nextBusyDay = useMemo(() => {
    if (slotsForDay.length > 0) return null;
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = ((day - 1 + offset) % 7) + 1;
      if ((dayCounts.get(candidate) ?? 0) > 0) return candidate;
    }
    return null;
  }, [day, dayCounts, slotsForDay.length]);

  /**
   * On today only: the period running right now, and the next one after it. Both
   * are read from the clock against `start_time`, never from a status the API
   * would have to invent.
   */
  const slotStates = useMemo(() => {
    const states = new Map<number, 'live' | 'next'>();
    const now = new Date();
    if (isoWeekday(now) !== day) return states;
    const minutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = slotsForDay.find((slot) => {
      const start = minutesOf(slot.start_time);
      const end = minutesOf(slot.end_time);
      if (start !== null && end !== null && minutes >= start && minutes < end) {
        states.set(slot.id, 'live');
        return false;
      }
      return start !== null && minutes < start;
    });
    if (upcoming) states.set(upcoming.id, 'next');
    return states;
  }, [slotsForDay, day]);

  const sessionCounts = useMemo(() => {
    const counts = { all: sessions.length, not_started: 0, in_progress: 0, completed: 0 };
    sessions.forEach((session) => {
      counts[session.status] += 1;
    });
    return counts;
  }, [sessions]);

  /** Newest first: a register is read from today backwards. */
  const visibleSessions = useMemo(() => {
    const list = filter === 'all' ? sessions : sessions.filter((s) => s.status === filter);
    return [...list].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return (a.schedule_time?.start_time ?? '').localeCompare(b.schedule_time?.start_time ?? '');
    });
  }, [sessions, filter]);

  /** Sessions of the open class, most recent first, for the sheet's context. */
  const slotSessions = useMemo(() => {
    if (!openSlot) return [];
    return sessions
      .filter((session) => session.schedule === openSlot.id)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [sessions, openSlot]);

  const bar = (
    <AppHeader
      title="Classes"
      eyebrow="Administration"
      subtitle="This week's timetable and the attendance register."
    />
  );

  if (loading) {
    return (
      <Screen header={bar}>
        <LoadingState label="Loading classes…" rows={5} />
      </Screen>
    );
  }

  if (error && schedules.length === 0 && sessions.length === 0) {
    return (
      <Screen header={bar}>
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </Screen>
    );
  }

  const todayIso = isoWeekday(new Date());

  return (
    <Screen
      animationKey={segment === 'timetable' ? `day-${day}` : segment}
      header={
        segment === 'timetable' ? (
          <View>
            {bar}
            <View style={styles.stripCard}>
              <DaySelector days={week} value={day} onChange={setDay} />
            </View>
          </View>
        ) : (
          bar
        )
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
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
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          options={[
            { label: 'Timetable', value: 'timetable', count: schedules.length },
            { label: 'Register', value: 'sessions', count: sessions.length },
          ]}
        />

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {segment === 'timetable' ? (
          <View style={styles.section}>
            <SectionHeader
              title={DAY_NAMES[day - 1]}
              detail={
                day === todayIso
                  ? `${formatDateWithWeekday(new Date())} · today`
                  : `${formatDate(week[day - 1]?.dayDate ?? new Date())} · ${
                      (dayCounts.get(day) ?? 0) > 0
                        ? countNoun(dayCounts.get(day) ?? 0, 'class')
                        : 'no classes scheduled'
                    }`
              }
              count={slotsForDay.length}
              countNoun={slotsForDay.length === 1 ? 'class' : 'classes'}
              countTone={day === todayIso ? 'blue' : 'gray'}
            />

            {slotsForDay.length === 0 ? (
              <EmptyState
                inline
                title={`Nothing on ${DAY_NAMES[day - 1]}`}
                body={
                  schedules.length === 0
                    ? 'Timetables are built in the web portal; they appear here as soon as they are saved.'
                    : 'This day of the week has no periods. Pick another day on the strip above.'
                }
                icon="calendar-outline"
                actionLabel={nextBusyDay ? `See ${DAY_NAMES[nextBusyDay - 1]}` : undefined}
                onAction={nextBusyDay ? () => setDay(nextBusyDay) : undefined}
              />
            ) : (
              <Card padded={false}>
                {slotsForDay.map((slot, index) => (
                  <ClassBlock
                    key={slot.id}
                    slot={slot}
                    state={slotStates.get(slot.id) ?? null}
                    divider={index < slotsForDay.length - 1}
                    onPress={() => setOpenSlot(slot)}
                  />
                ))}
              </Card>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <MetricsCard
              lead
              footnote={
                sessions.length
                  ? `${countNoun(
                      visibleSessions.reduce((sum, s) => sum + s.records.length, 0),
                      'mark'
                    )} across ${countNoun(visibleSessions.length, 'session')} shown`
                  : undefined
              }
              items={[
                { key: 'today', label: 'Not started', value: `${sessionCounts.not_started}`, tone: 'gray' },
                { key: 'open', label: 'In progress', value: `${sessionCounts.in_progress}`, tone: 'blue' },
                { key: 'done', label: 'Completed', value: `${sessionCounts.completed}`, tone: 'green' },
                { key: 'all', label: 'Generated', value: `${sessionCounts.all}`, tone: 'navy' },
              ]}
            />

            <View style={styles.filters}>
              {(
                [
                  { value: 'all', label: 'All' },
                  { value: 'not_started', label: 'Not started' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'completed', label: 'Completed' },
                ] as { value: SessionFilter; label: string }[]
              ).map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  count={sessionCounts[option.value]}
                  selected={filter === option.value}
                  tone="navy"
                  onPress={() => {
                    animateLayout();
                    setFilter(option.value);
                  }}
                />
              ))}
            </View>

            {visibleSessions.length === 0 ? (
              <EmptyState
                inline
                title={filter === 'all' ? 'No sessions generated' : `No ${labelForFilter(filter).toLowerCase()} sessions`}
                body={
                  filter === 'all'
                    ? 'Sessions are created from the timetable in the web portal, then marked by the teacher.'
                    : 'Change the filter above to see the rest of the register.'
                }
                icon="clipboard-outline"
                actionLabel={filter !== 'all' ? 'Show all' : undefined}
                onAction={filter !== 'all' ? () => setFilter('all') : undefined}
              />
            ) : (
              <View style={styles.groups}>
                {groupByDay(visibleSessions).map((group) => (
                  <View key={group.date} style={styles.section}>
                    <SectionHeader
                      title={group.label}
                      detail={group.detail}
                      count={group.items.length}
                      countNoun={group.items.length === 1 ? 'session' : 'sessions'}
                      countTone="gray"
                    />
                    <Card padded={false}>
                      {group.items.map((session, index) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          expanded={expanded === session.id}
                          divider={index < group.items.length - 1}
                          onToggle={() => {
                            animateLayout();
                            hapticImpact('light');
                            setExpanded(expanded === session.id ? null : session.id);
                          }}
                        />
                      ))}
                    </Card>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Sheet
        visible={openSlot !== null}
        onClose={() => setOpenSlot(null)}
        title={openSlot ? openSlot.teacher_assignment_detail.subject_name : ''}
        subtitle={openSlot ? `${DAY_NAMES[openSlot.day_of_week - 1]} · ${hhmm(openSlot.start_time)}` : ''}
        footer={
          <View style={styles.sheetActions}>
            <Button
              variant="primary"
              size="md"
              icon="clipboard-outline"
              block
              onPress={() => {
                setOpenSlot(null);
                setSegment('sessions');
              }}
            >
              Register
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon="chatbubble-ellipses-outline"
              block
              onPress={() => {
                setOpenSlot(null);
                router.push('/messages/new');
              }}
            >
              Message teacher
            </Button>
          </View>
        }
      >
        {openSlot ? (
          <View style={styles.facts}>
            <Fact label="Teacher" value={openSlot.teacher_assignment_detail.teacher_name} />
            <Fact
              label="Section"
              value={sectionLabel(openSlot.teacher_assignment_detail.section_name)}
            />
            <Fact
              label="Time"
              value={`${hhmm(openSlot.start_time)} – ${hhmm(openSlot.end_time)}${
                spanOf(openSlot.start_time, openSlot.end_time)
                  ? ` (${spanOf(openSlot.start_time, openSlot.end_time)})`
                  : ''
              }`}
            />
            <Fact label="Room" value={openSlot.room?.trim() ? openSlot.room : 'Not assigned'} />
            <View style={styles.fact}>
              <Text style={styles.factLabel}>SESSIONS</Text>
              {slotSessions.length === 0 ? (
                <Text style={styles.factValue}>
                  No attendance sessions generated from this period yet.
                </Text>
              ) : (
                <View style={styles.slotSessions}>
                  {slotSessions.map((session) => (
                    <View key={session.id} style={styles.slotSessionRow}>
                      <Text style={styles.slotSessionDate}>
                        {`${dayHeading(session.date)} · ${formatDate(session.date)}`}
                      </Text>
                      <Badge
                        label={session.status_display}
                        tone={sessionTone(session.status)}
                        shape="dot"
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Timetable block                                                     */
/* ------------------------------------------------------------------ */

function ClassBlock({
  slot,
  state,
  divider,
  onPress,
}: {
  slot: ClassSchedule;
  state: 'live' | 'next' | null;
  divider: boolean;
  onPress: () => void;
}) {
  const detail = slot.teacher_assignment_detail;
  const hue = subjectHue(detail.subject_name);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.block, divider && styles.blockDivider, pressed && styles.blockPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${detail.subject_name}, ${hhmm(slot.start_time)} to ${hhmm(
        slot.end_time
      )}, ${sectionLabel(detail.section_name)}, ${detail.teacher_name}`}
    >
      <View style={styles.blockTime}>
        <Text style={styles.blockStart}>{hhmm(slot.start_time)}</Text>
        <Text style={styles.blockEnd}>{hhmm(slot.end_time)}</Text>
        {spanOf(slot.start_time, slot.end_time) ? (
          <Text style={styles.blockSpan}>{spanOf(slot.start_time, slot.end_time)}</Text>
        ) : null}
      </View>

      <View style={[styles.blockRail, { backgroundColor: hue }]} />

      <View style={styles.blockBody}>
        <Text style={styles.blockSubject} numberOfLines={1}>
          {detail.subject_name}
        </Text>
        <Text style={styles.blockTeacher} numberOfLines={1}>
          {detail.teacher_name}
        </Text>
        <View style={styles.blockTags}>
          <View style={styles.tag}>
            <Ionicons name="people-outline" size={12} color={colors.textMuted} />
            <Text style={styles.tagText} numberOfLines={1}>
              {sectionLabel(detail.section_name)}
            </Text>
          </View>
          {slot.room?.trim() ? (
            <View style={styles.tag}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.tagText}>{slot.room}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {state ? (
        <Badge
          label={state === 'live' ? 'In session' : 'Next'}
          tone={state === 'live' ? 'green' : 'blue'}
          shape="dot"
        />
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Register row                                                        */
/* ------------------------------------------------------------------ */

function SessionRow({
  session,
  expanded,
  divider,
  onToggle,
}: {
  session: AttendanceSession;
  expanded: boolean;
  divider: boolean;
  onToggle: () => void;
}) {
  const marks = tally(session);
  const start = session.schedule_time?.start_time ?? null;
  const end = session.schedule_time?.end_time ?? null;

  return (
    <View style={divider ? styles.rowDivider : undefined}>
      <ListRow
        title={session.subject_name}
        subtitle={`${sectionLabel(session.section_name)}${
          start ? ` · ${hhmm(start)}${end ? `–${hhmm(end)}` : ''}` : ''
        }`}
        detail={
          marks.total === 0
            ? 'No marks recorded yet'
            : `${countNoun(marks.total, 'mark')} · ${marks.present} present${
                marks.absent ? `, ${marks.absent} absent` : ''
              }`
        }
        trailing={<Badge label={session.status_display} tone={sessionTone(session.status)} />}
        chevron={false}
        onPress={onToggle}
      />

      {expanded ? (
        <View style={styles.panel}>
          {marks.total > 0 ? (
            <>
              <ProgressBar
                value={(marks.present / marks.total) * 100}
                label="Present"
                detail={`${marks.present} of ${marks.total}`}
                tone="green"
                thickness="thin"
              />
              {session.records.map((record) => (
                <ListRow
                  key={record.id}
                  title={record.student_name}
                  subtitle={record.notes?.trim() ? record.notes : undefined}
                  accent={MARK_TONE[record.status] ?? 'gray'}
                  trailing={
                    <Badge label={record.status} tone={MARK_TONE[record.status] ?? 'gray'} shape="dot" />
                  }
                  chevron={false}
                  style={styles.markRow}
                />
              ))}
            </>
          ) : (
            <Text style={styles.panelNote}>
              This session has not been taken yet. Marks appear as soon as the teacher records
              them.
            </Text>
          )}
          {session.notes.trim() ? <Text style={styles.panelNotes}>“{session.notes.trim()}”</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Day grouping                                                        */
/* ------------------------------------------------------------------ */

/**
 * A register group header. `formatRelativeDay` folds every future date into
 * "Today", which is wrong for a register that holds next week's generated
 * sessions, so the three words that matter — Today, Yesterday, Tomorrow — are
 * decided against calendar days here, and everything else keeps its date.
 */
function dayHeading(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return formatDateWithWeekday(date);
}

/** The date under a relative group header, so "Today" is still traceable. */
function dayHeadingDetail(value: string): string | undefined {
  const heading = dayHeading(value);
  return heading === formatDateWithWeekday(value) ? undefined : formatDate(value);
}

type DayGroup = { date: string; label: string; detail?: string; items: AttendanceSession[] };

/**
 * The register read backwards from today: three sessions on a Monday belong to
 * Monday, and a long flat list hides that.
 */
function groupByDay(sessions: AttendanceSession[]): DayGroup[] {
  const groups: DayGroup[] = [];
  sessions.forEach((session) => {
    const last = groups[groups.length - 1];
    if (last && last.date === session.date) {
      last.items.push(session);
      return;
    }
    groups.push({
      date: session.date,
      label: dayHeading(session.date),
      detail: dayHeadingDetail(session.date),
      items: [session],
    });
  });
  return groups;
}

function labelForFilter(value: SessionFilter): string {
  if (value === 'not_started') return 'Not started';
  if (value === 'in_progress') return 'In progress';
  if (value === 'completed') return 'Completed';
  return 'All';
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  section: { gap: spacing.md },
  groups: { gap: spacing.xl },
  stripCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  /* Timetable block ---------------------------------------------------- */
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  blockDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  blockPressed: { backgroundColor: colors.blueWash },
  blockTime: { width: 52, gap: 1 },
  blockStart: { ...typography.subhead, color: colors.navy },
  blockEnd: { ...typography.subtle, color: colors.textSubtle },
  blockSpan: { ...typography.micro, fontSize: 10, color: colors.blueText, marginTop: 2 },
  /** The subject's hue, so a week of periods scans by colour before it scans by name. */
  blockRail: { width: 4, height: 46, borderRadius: 2 },
  blockBody: { flex: 1, minWidth: 0, gap: 2 },
  blockSubject: { ...typography.subhead },
  blockTeacher: { ...typography.caption, color: colors.textSubtle },
  blockTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceAlt,
    maxWidth: '100%',
  },
  tagText: { ...typography.micro, fontSize: 11, fontWeight: '400', color: colors.textMuted },

  /* Register ----------------------------------------------------------- */
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  panel: {
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  markRow: { minHeight: 44, paddingVertical: spacing.sm, paddingHorizontal: 0 },
  panelNote: { ...typography.caption, color: colors.textSubtle },
  panelNotes: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },

  /* Sheet -------------------------------------------------------------- */
  facts: { gap: spacing.lg },
  fact: { gap: spacing.xxs },
  factLabel: { ...typography.label, color: colors.textSubtle },
  factValue: { ...typography.body, color: colors.text },
  slotSessions: { gap: spacing.xs },
  slotSessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  slotSessionDate: { ...typography.caption, color: colors.text },
  sheetActions: { flexDirection: 'row', gap: spacing.sm },
});
