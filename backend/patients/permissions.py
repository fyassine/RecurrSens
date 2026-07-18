"""
Custom DRF permissions for the patients app.

Two access patterns:
1. Admin (JWT-authenticated users) — full CRUD access, role-gated
2. Patient (UUID token in URL) — limited access to own data only

Role helpers:
  _get_role(user)   → 'SUPER_ADMIN' | 'CENTER_USER' (falls back to SUPER_ADMIN)
  _get_center(user) → Center instance or None
"""

from rest_framework.permissions import BasePermission, IsAuthenticated


def _get_role(user) -> str:
    """Return user role; falls back to SUPER_ADMIN if no UserProfile exists."""
    try:
        return user.profile.role
    except Exception:
        return 'SUPER_ADMIN'


def _get_center(user):
    """Return the user's Center instance, or None."""
    try:
        return user.profile.center
    except Exception:
        return None


class IsAdminUser(IsAuthenticated):
    """
    Standard JWT-authenticated admin user.
    Inherits from IsAuthenticated — requires valid JWT token.
    """

    pass


class IsSuperAdmin(IsAuthenticated):
    """Only SUPER_ADMIN role. Used to restrict delete and export endpoints."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return _get_role(request.user) == 'SUPER_ADMIN'


class IsPatientTokenValid(BasePermission):
    """
    Allows access if the request contains a valid patient UUID token.
    Used for patient-facing endpoints (wizard, audio upload).
    The token is passed as a URL parameter, not as an auth header.
    """

    def has_permission(self, request, view):
        from .models import Patient

        token = view.kwargs.get('token')
        if not token:
            return False
        return Patient.objects.filter(id=token).exists()


class IsAdminOrPatientToken(BasePermission):
    """
    Allows access if either:
    - The request has a valid JWT token (admin), OR
    - The request contains a valid patient UUID token in the URL
    """

    def has_permission(self, request, view):
        # Check JWT auth first
        if request.user and request.user.is_authenticated:
            return True
        # Fall back to patient token
        return IsPatientTokenValid().has_permission(request, view)
