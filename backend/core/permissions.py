"""
TRACK — Custom DRF permission classes
All permission logic lives here, never in the frontend.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Only users with role='admin'."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsTeacher(BasePermission):
    """Only users with role='teacher'."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_teacher)


class IsStudent(BasePermission):
    """Only users with role='student'."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_student)


class IsParent(BasePermission):
    """Only users with role='parent'."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_parent)


class IsAdminOrTeacher(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_admin or request.user.is_teacher)
        )


class IsAdminOrReadOnly(BasePermission):
    """Read is open to any authenticated user; write is admin-only."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.is_admin


# ---------------------------------------------------------------------------
# Department-scoped administration (see core/rbac.py)
#
# These classes gate the *admin* branch of an endpoint on a permission key.
# Teachers, students and parents keep the role-based access they already had —
# where a view serves them too, it checks the key itself via require_key().
# ---------------------------------------------------------------------------

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class AdminCan(BasePermission):
    """
    Administrator access gated on permission keys.

    read_key is asked for on GET/HEAD/OPTIONS, write_key on every other verb
    (defaults to read_key). A read_key of None means "any administrator may
    read"; writes always need the key. Everyone who is not an administrator is
    refused — this class is for endpoints that are admin-only by design.
    """

    def __init__(self, read_key=None, write_key=None):
        self.read_key = read_key
        self.write_key = write_key or read_key
        super().__init__()

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_admin):
            return False
        if request.method in SAFE_METHODS:
            return self.read_key is None or user.has_perm_key(self.read_key)
        return user.has_perm_key(self.write_key)


def require_key(user, key, message=None):
    """
    Guard for views whose non-admin roles are handled inside the view.

    Non-administrators pass through so the view's own role scoping keeps
    running; an administrator must hold the key or the request is refused with
    403.
    """
    if user.is_admin and not user.has_perm_key(key):
        raise PermissionDenied(
            message or f"You do not have the '{key}' permission."
        )


class AdminKeyOrReadOnly(BasePermission):
    """
    Replaces IsAdminOrReadOnly where writes are gated by a permission key.

    Reads stay as open as they were; writes require an administrator holding
    write_key. Non-administrators can never write.
    """

    def __init__(self, write_key=None):
        self.write_key = write_key
        super().__init__()

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return bool(user.is_admin and user.has_perm_key(self.write_key))


class AdminKeyOrTeacher(BasePermission):
    """
    Replaces IsAdminOrTeacher where administrators are department-scoped.

    Teachers keep the access they always had (their own classes are enforced
    in the views). Administrators must hold the key; anyone else is refused.
    """

    def __init__(self, read_key=None, write_key=None):
        self.read_key = read_key
        self.write_key = write_key or read_key
        super().__init__()

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_teacher:
            return True
        if not user.is_admin:
            return False
        key = self.read_key if request.method in SAFE_METHODS else self.write_key
        return user.has_perm_key(key)

