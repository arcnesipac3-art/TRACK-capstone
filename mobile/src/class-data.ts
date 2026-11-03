/**
 * TRACK — the six lists a teacher's class screens are built from.
 *
 * Same fetch set as the web app's `useClassData` (frontend/src/hooks), against
 * endpoints that already exist and already scope themselves to the requesting
 * teacher: `/teacher-assignments/` filters on `teacher=request.user`, `/students/`
 * returns only the sections that teacher is assigned to, `/requirements/` only
 * their own rows, `/submissions/` only submissions against those requirements,
 * and `/attendance/sessions/` only their sessions. Nothing here widens access:
 * the server decides what a token may read, and this hook just asks for it once
 * so the hub and the class screen show the same numbers.
 */
import { useCallback, useEffect, useState } from 'react';

import { ApiError, api } from './api/client';
import type {
  AttendanceSession,
  Requirement,
  Section,
  StudentProfile,
  Submission,
  TeacherAssignment,
} from './api/types';
import { buildClassRows, type ClassRow } from './class-board';

export type ClassData = {
  rows: ClassRow[];
  submissions: Submission[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  setRefreshing: (value: boolean) => void;
};

export function useClassData(): ClassData {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [assignments, sections, students, requirements, subs, sessions] = await Promise.all([
        api.list<TeacherAssignment>('/teacher-assignments/'),
        api.list<Section>('/sections/'),
        api.list<StudentProfile>('/students/'),
        api.list<Requirement>('/requirements/'),
        api.list<Submission>('/submissions/'),
        api.list<AttendanceSession>('/attendance/sessions/'),
      ]);
      setSubmissions(subs);
      setRows(
        buildClassRows({ assignments, sections, students, requirements, submissions: subs, sessions })
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your classes.');
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

  const reload = () => {
    setLoading(true);
    load();
  };

  return { rows, submissions, loading, refreshing, error, reload, setRefreshing };
}
