/**
 * Teacher notices — announcements (with compose) + notifications.
 *
 * `canPost` enables the compose form; the backend restricts a teacher's
 * section targets to sections they actually teach.
 */
import NoticesScreen from '../../../components/NoticesScreen';

export default function TeacherNoticesScreen() {
  return <NoticesScreen canPost initialSegment="announcements" />;
}
