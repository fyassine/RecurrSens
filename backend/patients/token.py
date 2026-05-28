from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class CenterTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        try:
            profile = user.profile
            token['role'] = profile.role
            token['center_id'] = str(profile.center_id) if profile.center_id else None
        except Exception:
            # No UserProfile row → legacy superuser, treat as SUPER_ADMIN
            token['role'] = 'SUPER_ADMIN'
            token['center_id'] = None
        return token


class CenterTokenObtainPairView(TokenObtainPairView):
    serializer_class = CenterTokenObtainPairSerializer
