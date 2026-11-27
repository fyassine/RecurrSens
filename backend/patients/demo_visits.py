"""
Usage log for the live demo: who opened it, and who got as far as a result.

Kept apart from demo_views.py on purpose — that module handles audio and must
stay free of ORM calls. Nothing here receives audio, demographics or the
verdict, and the client IP is not stored.

    POST /api/demo/{demo_token}/visit/
         {"visit_id": uuid, "event": "opened" | "completed", "device": {...}}
"""

from django.conf import settings
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DemoVisit
from .services import USER_AGENT_MAX_LENGTH, parse_user_agent


class DemoDeviceSerializer(serializers.Serializer):
    """Client-reported fields. Anything not listed here is dropped."""

    screen_width = serializers.IntegerField(required=False, min_value=0, max_value=100000)
    screen_height = serializers.IntegerField(required=False, min_value=0, max_value=100000)
    device_pixel_ratio = serializers.FloatField(required=False, min_value=0, max_value=100)
    max_touch_points = serializers.IntegerField(required=False, min_value=0, max_value=1000)
    platform = serializers.CharField(required=False, allow_blank=True, max_length=100)
    language = serializers.CharField(required=False, allow_blank=True, max_length=35)


class DemoVisitSerializer(serializers.Serializer):
    visit_id = serializers.UUIDField()
    event = serializers.ChoiceField(choices=['opened', 'completed'])
    device = DemoDeviceSerializer(required=False)


class LiveDemoVisitView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'demo_visit'

    def post(self, request, token):
        if not settings.DEMO_MODE_ENABLED:
            raise Http404()

        serializer = DemoVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user_agent = request.META.get('HTTP_USER_AGENT', '')[:USER_AGENT_MAX_LENGTH]
        # "completed" also creates the row, in case the "opened" call was lost.
        visit, _ = DemoVisit.objects.get_or_create(
            id=data['visit_id'],
            defaults={
                'booth_token': token,
                'device_info': {
                    **parse_user_agent(user_agent),
                    **data.get('device', {}),
                    'user_agent': user_agent,
                },
            },
        )

        if data['event'] == 'completed':
            # Filtered update so a repeat run keeps the first completion time.
            DemoVisit.objects.filter(id=visit.id, completed_at__isnull=True).update(
                completed_at=timezone.now()
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
