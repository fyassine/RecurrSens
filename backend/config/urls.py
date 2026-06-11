"""
URL Configuration for the project.
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView

from patients.token import CenterTokenObtainPairView

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),

    # JWT Authentication
    path('api/auth/token/', CenterTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API endpoints
    path('api/', include('patients.urls')),
]
