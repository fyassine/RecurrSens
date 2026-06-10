from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from . import services


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

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                user = get_user_model().objects.get(username=request.data.get('username'))
                services.record_login(user, request)
            except Exception:
                pass
        return response
