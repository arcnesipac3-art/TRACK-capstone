"""
TRACK — Custom DRF permission classes
All permission logic lives here, never in the frontend.
"""

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
