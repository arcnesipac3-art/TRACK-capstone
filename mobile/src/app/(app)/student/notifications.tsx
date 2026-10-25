/**
 * Student notices — announcements + notifications.
 *
 * Thin wrapper over the shared NoticesScreen: students may read both and
 * mark their own notifications read; posting announcements is teacher/admin
 * only (enforced by the backend, not by hiding it here).
 */
import NoticesScreen from '../../../components/NoticesScreen';

export default function StudentNoticesScreen() {
  return <NoticesScreen canPost={false} initialSegment="notifications" />;
}
