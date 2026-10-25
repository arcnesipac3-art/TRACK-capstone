/**
 * Parent notices — announcements + notifications.
 *
 * Thin wrapper over the shared NoticesScreen. The backend already scopes
 * announcements to the parent's audience and their children's sections.
 */
import NoticesScreen from '../../../components/NoticesScreen';

export default function ParentNoticesScreen() {
  return <NoticesScreen canPost={false} initialSegment="notifications" />;
}
