/**
 * Admin directory — the people and sections the school is made of.
 *
 * Endpoints: GET /students/, GET /users/?role=teacher|parent, GET /sections/
 * (all admin-only, enforced server-side). The screen reads; the write side is
 * `/admin/accounts`, which the section header links to.
 *
 * A row opens a bottom sheet rather than a new screen: the answer to "who is
 * this?" is four lines of facts, and pushing a full page for four lines costs
 * the context you just came from. The actions that do need a page — message
 * this person, manage their account — are in the sheet's footer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { colors, spacing, typography } from '../../../theme';
import { api, ApiError } from '../../../api/client';
import type { AdminUser, Section, StudentProfile } from '../../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../../components/StateViews';
import AppHeader from '../../../components/ui/AppHeader';
import Avatar from '../../../components/ui/Avatar';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ListRow from '../../../components/ui/ListRow';
import Screen from '../../../components/ui/Screen';
import SearchField from '../../../components/ui/SearchField';
import SectionHeader from '../../../components/ui/SectionHeader';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import Sheet from '../../../components/ui/Sheet';

type Segment = 'students' | 'teachers' | 'parents' | 'sections';

/** One thing the directory knows about, in whichever shape the API sends it. */
type Entry =
  | {
      kind: 'student';
      kindLabel: string;
      key: string;
      name: string;
      subtitle: string;
      meta?: string;
      active: boolean;
      haystack: string;
      record: StudentProfile;
    }
  | {
      kind: 'person';
      kindLabel: string;
      key: string;
      name: string;
      subtitle: string;
      meta?: string;
      active: boolean;
      haystack: string;
      record: AdminUser;
    }
  | {
      kind: 'section';
      kindLabel: string;
      key: string;
      name: string;
      subtitle: string;
      meta?: string;
      haystack: string;
      record: Section;
    };

const SEGMENT_LABEL: Record<Segment, string> = {
  students: 'Students',
  teachers: 'Teachers',
  parents: 'Parents',
  sections: 'Sections',
};

export default function AdminDirectoryScreen() {
  const [segment, setSegment] = useState<Segment>('students');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Entry | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [parents, setParents] = useState<AdminUser[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, t, p, sec] = await Promise.all([
        api.list<StudentProfile>('/students/'),
        api.list<AdminUser>('/users/', { params: { role: 'teacher' } }),
        api.list<AdminUser>('/users/', { params: { role: 'parent' } }),
        api.list<Section>('/sections/'),
      ]);
      setStudents(s);
      setTeachers(t);
      setParents(p);
      setSections(sec);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the directory.');
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

  const entries: Entry[] = useMemo(() => {
    if (segment === 'students') {
      return students.map((s) => ({
        kind: 'student' as const,
        kindLabel: 'Student',
        key: `s${s.id}`,
        name: s.user.full_name,
        active: s.user.is_active,
        subtitle: `${s.section_name ?? 'No section'} · @${s.user.username}`,
        meta: s.lrn ?? undefined,
        haystack: `${s.user.full_name} @${s.user.username} ${s.section_name ?? ''} ${s.lrn ?? ''} ${s.user.email ?? ''}`,
        record: s,
      }));
    }
    if (segment === 'sections') {
      return sections.map((sec) => ({
        kind: 'section' as const,
        kindLabel: 'Section',
        key: `sec${sec.id}`,
        name: `${sec.grade_level_name} — ${sec.name}`,
        active: true,
        subtitle: `${sec.student_count} students · ${sec.adviser_name ?? 'No adviser'}`,
        meta: sec.school_year_label,
        haystack: `${sec.name} ${sec.grade_level_name} ${sec.adviser_name ?? ''} ${sec.school_year_label}`,
        record: sec,
      }));
    }

    const people = segment === 'teachers' ? teachers : parents;
    return people.map((u) => ({
      kind: 'person' as const,
      kindLabel: segment === 'teachers' ? 'Teacher' : 'Parent',
      key: `u${u.id}`,
      name: u.full_name,
      active: u.is_active,
      subtitle: `@${u.username}${u.email ? ` · ${u.email}` : ''}`,
      haystack: `${u.full_name} @${u.username} ${u.email ?? ''}`,
      record: u,
    }));
  }, [segment, students, teachers, parents, sections]);

  /**
   * Filtered in memory: the four lists are already loaded, and a directory the
   * size of a school is not worth a round trip per keystroke.
   */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.haystack.toLowerCase().includes(needle));
  }, [entries, query]);

  const header = (
    <AppHeader
      title="Directory"
      eyebrow="Administration"
      subtitle="Everyone enrolled, and every section they belong to."
    />
  );

  if (loading) {
    return (
      <Screen header={header}>
        <LoadingState label="Loading directory…" rows={6} />
      </Screen>
    );
  }

  if (error && entries.length === 0) {
    return (
      <Screen header={header}>
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

  return (
    <Screen header={header} animationKey={segment}>
      <ScrollView
        contentContainerStyle={styles.content}
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
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          options={[
            { label: 'Students', value: 'students', count: students.length },
            { label: 'Teachers', value: 'teachers', count: teachers.length },
            { label: 'Parents', value: 'parents', count: parents.length },
            { label: 'Sections', value: 'sections', count: sections.length },
          ]}
        />

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={`Search ${SEGMENT_LABEL[segment].toLowerCase()} by name, username or email`}
          testID="directory-search"
        />

        <SectionHeader
          title={SEGMENT_LABEL[segment]}
          count={visible.length}
          countNoun={visible.length === 1 ? 'result' : 'results'}
          countTone="blue"
          actionLabel="Accounts"
          onAction={() => router.push('/admin/accounts')}
        />

        {error ? <Text style={styles.staleError}>{error}</Text> : null}

        {visible.length === 0 ? (
          <EmptyState
            inline
            title={query ? `No ${SEGMENT_LABEL[segment].toLowerCase()} match “${query}”` : `No ${SEGMENT_LABEL[segment].toLowerCase()} yet`}
            body={
              query
                ? 'Try a first name, a username, an LRN or an email address.'
                : segment === 'sections'
                  ? 'Sections are built in the web portal; they appear here once enrolled.'
                  : 'Accounts created by the registrar show up here.'
            }
            icon={query ? 'search-outline' : 'people-outline'}
            actionLabel={query ? 'Clear search' : undefined}
            onAction={query ? () => setQuery('') : undefined}
          />
        ) : (
          <Card padded={false}>
            {visible.map((entry, index) => (
              <ListRow
                key={entry.key}
                avatar={entry.kind === 'section' ? undefined : entry.name}
                icon={entry.kind === 'section' ? 'school-outline' : undefined}
                tone={entry.kind === 'section' ? 'navy' : undefined}
                title={entry.name}
                subtitle={entry.subtitle}
                meta={entry.meta}
                trailing={entry.kind === 'section' || entry.active ? undefined : <Badge label="Inactive" tone="red" shape="dot" />}
                divider={index < visible.length - 1}
                onPress={() => setOpen(entry)}
              />
            ))}
          </Card>
        )}
      </ScrollView>

      <Sheet
        visible={open !== null}
        onClose={() => setOpen(null)}
        title={open ? open.name : ''}
        subtitle={open?.kindLabel ?? ''}
        footer={
          <View style={styles.actions}>
            <Button
              variant="primary"
              size="md"
              icon="chatbubble-ellipses-outline"
              block
              onPress={() => {
                setOpen(null);
                router.push('/messages/new');
              }}
            >
              Message
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon="settings-outline"
              block
              onPress={() => {
                setOpen(null);
                router.push('/admin/accounts');
              }}
            >
              Manage account
            </Button>
          </View>
        }
      >
        {open ? <Facts entry={open} /> : null}
      </Sheet>
    </Screen>
  );
}

/** The four or five lines that answer "who is this", from the record already loaded. */
function Facts({ entry }: { entry: Entry }) {
  if (entry.kind === 'section') {
    const s = entry.record;
    return (
      <View style={styles.facts}>
        <Fact label="Section" value={`${s.grade_level_name} — ${s.name}`} />
        <Fact label="Adviser" value={s.adviser_name ? s.adviser_name : 'Not assigned'} />
        <Fact label="Students enrolled" value={`${s.student_count}`} />
        <Fact label="School year" value={s.school_year_label} />
      </View>
    );
  }

  if (entry.kind === 'student') {
    const s = entry.record;
    return (
      <View style={styles.facts}>
        <View style={styles.identity}>
          <Avatar name={s.user.full_name} size="lg" />
          <View style={styles.identityText}>
            <Text style={styles.identityName}>{s.user.full_name}</Text>
            <Text style={styles.identityLine}>@{s.user.username}</Text>
          </View>
          {s.user.is_active ? null : <Badge label="Inactive" tone="red" shape="dot" />}
        </View>
        <Fact label="LRN" value={recorded(s.lrn)} />
        <Fact label="Section" value={s.section_name ? s.section_name : 'Not assigned'} />
        <Fact label="Email" value={recorded(s.user.email)} />
        <Fact label="Contact number" value={recorded(s.contact_number)} />
        <Fact label="Date of birth" value={recorded(s.date_of_birth)} />
        {s.address ? <Fact label="Address" value={s.address} /> : null}
      </View>
    );
  }

  const u = entry.record;
  return (
    <View style={styles.facts}>
      <View style={styles.identity}>
        <Avatar name={u.full_name} size="lg" />
        <View style={styles.identityText}>
          <Text style={styles.identityName}>{u.full_name}</Text>
          <Text style={styles.identityLine}>@{u.username}</Text>
        </View>
        {u.is_active ? null : <Badge label="Inactive" tone="red" shape="dot" />}
      </View>
      <Fact label="Role" value={u.role} />
      <Fact label="Email" value={recorded(u.email)} />
      <Fact label="Status" value={u.is_active ? 'Active' : 'Inactive'} />
    </View>
  );
}

/** The API sends an absent field as `null` or as `''` depending on the serializer. */
function recorded(value: string | null): string {
  return value && value.trim() ? value : 'Not recorded';
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  staleError: { ...typography.caption, color: colors.redText },
  facts: { gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
  identityName: { ...typography.heading, color: colors.text },
  identityLine: { ...typography.caption, color: colors.textSubtle },
  fact: { gap: spacing.xxs },
  factLabel: { ...typography.label, color: colors.textSubtle },
  factValue: { ...typography.body, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
