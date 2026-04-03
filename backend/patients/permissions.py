"""
Custom DRF permissions for the patients app.

Two access patterns:
1. Admin (JWT-authenticated users) — full CRUD access
2. Patient (UUID token in URL) — limited access to own data only
"""
from rest_framework.permissions import BasePermission, IsAuthenticated


class IsAdminUser(IsAuthenticated):
    """
    Standard JWT-authenticated admin user.
    Inherits from IsAuthenticated — requires valid JWT token.
    """
    pass


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
