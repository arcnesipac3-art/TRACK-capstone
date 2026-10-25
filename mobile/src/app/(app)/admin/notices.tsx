/**
 * Admin notices — announcements (with compose) + notifications.
 *
 * An admin may post for any audience and any section (or school-wide).
 */
import NoticesScreen from '../../../components/NoticesScreen';

export default function AdminNoticesScreen() {
  return <NoticesScreen canPost initialSegment="announcements" />;
}
