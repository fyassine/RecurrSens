"""
Management command: compute the cohort metrics referenced in the scientific
abstract (docs/research/abstract-draft.md).

Two figures are marked [TBD] in that draft and are produced here:

1. Number of enrolled patients (excluding soft-deleted records), with a
   breakdown across Patient.Status and the post-op completion count.
2. Average patient-reported usability rating (PatientFeedback.rating, 1-5),
   excluding null and skipped feedback, with the per-phase split.

Usage:
    python manage.py abstract_metrics
    python manage.py abstract_metrics --center "MRI"      # restrict to one centre
    python manage.py abstract_metrics --json              # machine-readable output
"""

import json
import math

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Avg, Count

from patients.models import Center, Patient, PatientFeedback, RecordingSession


class Command(BaseCommand):
    help = 'Print the enrolment and usability-feedback numbers used in the research abstract'

    def add_arguments(self, parser):
        parser.add_argument(
            '--center',
            type=str,
            default=None,
            dest='center_name',
            help='Restrict all metrics to a single centre (exact Center.name)',
        )
        parser.add_argument(
            '--json',
            action='store_true',
            dest='as_json',
            help='Emit the metrics as JSON instead of a human-readable report',
        )

    def handle(self, *args, **options):
        center_name = options['center_name']
        as_json = options['as_json']

        center = None
        if center_name:
            try:
                center = Center.objects.get(name=center_name)
            except Center.DoesNotExist:
                existing = list(Center.objects.values_list('name', flat=True))
                raise CommandError(
                    f'Center "{center_name}" not found.\nExisting centers: {existing or ["(none)"]}'
                ) from None

        metrics = {
            'center': center.name if center else None,
            'enrolment': self._enrolment_metrics(center),
            'usability': self._usability_metrics(center),
        }

        if as_json:
            self.stdout.write(json.dumps(metrics, indent=2, ensure_ascii=False))
        else:
            self._report(metrics)

    # --- metric 1: enrolled patients -------------------------------------------------

    def _enrolment_metrics(self, center):
        """
        Enrolled patients, excluding soft-deleted records (deleted_at set means the
        audio has been purged, so those patients no longer contribute voice data).
        """
        qs = Patient.objects.filter(deleted_at__isnull=True)
        if center:
            qs = qs.filter(center=center)

        counts = {row['status']: row['n'] for row in qs.values('status').annotate(n=Count('id'))}
        by_status = {value: counts.get(value, 0) for value, _label in Patient.Status.choices}

        deleted_qs = Patient.objects.filter(deleted_at__isnull=False)
        if center:
            deleted_qs = deleted_qs.filter(center=center)

        return {
            'total_enrolled': qs.count(),
            'completed_post_op': by_status[Patient.Status.POST_OP_DONE],
            'completed_pre_op_or_later': sum(
                by_status[s]
                for s in (
                    Patient.Status.PRE_OP_DONE,
                    Patient.Status.POST_OP_STARTED,
                    Patient.Status.POST_OP_DONE,
                )
            ),
            'by_status': by_status,
            'soft_deleted_excluded': deleted_qs.count(),
        }

    # --- metric 2: usability feedback ------------------------------------------------

    def _usability_metrics(self, center):
        """
        Mean PatientFeedback.rating on the 1-5 scale. Ratings are nullable (a patient
        may leave a comment only) and feedback may be explicitly skipped, so both are
        excluded before averaging.
        """
        qs = PatientFeedback.objects.filter(
            rating__isnull=False,
            skipped=False,
            patient__deleted_at__isnull=True,
        )
        if center:
            qs = qs.filter(patient__center=center)

        overall = qs.aggregate(average_rating=Avg('rating'), n_ratings=Count('id'))

        by_phase = {}
        for value, _label in RecordingSession.Phase.choices:
            phase_qs = qs.filter(phase=value)
            by_phase[value] = phase_qs.aggregate(
                average_rating=Avg('rating'), n_ratings=Count('id')
            )

        distribution = {
            row['rating']: row['n'] for row in qs.values('rating').annotate(n=Count('id'))
        }

        return {
            'average_rating': overall['average_rating'],
            'n_ratings': overall['n_ratings'],
            'std_dev': self._std_dev(list(qs.values_list('rating', flat=True))),
            'by_phase': by_phase,
            'distribution': {str(r): distribution.get(r, 0) for r in range(1, 6)},
            'skipped_or_unrated': self._skipped_count(center),
        }

    def _skipped_count(self, center):
        qs = PatientFeedback.objects.filter(patient__deleted_at__isnull=True)
        if center:
            qs = qs.filter(patient__center=center)
        return (
            qs.filter(rating__isnull=True).count()
            + qs.filter(skipped=True).exclude(rating__isnull=True).count()
        )

    @staticmethod
    def _std_dev(values):
        """Sample standard deviation; None when fewer than two ratings exist."""
        if len(values) < 2:
            return None
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
        return math.sqrt(variance)

    # --- reporting -------------------------------------------------------------------

    def _report(self, metrics):
        scope = f'centre "{metrics["center"]}"' if metrics['center'] else 'all centres'
        enrolment = metrics['enrolment']
        usability = metrics['usability']

        self.stdout.write(self.style.MIGRATE_HEADING(f'\nAbstract cohort metrics — {scope}'))

        self.stdout.write(self.style.MIGRATE_HEADING('\n1. Enrolled patients'))
        self.stdout.write(
            f'   Total enrolled (excl. soft-deleted): '
            f'{self.style.SUCCESS(str(enrolment["total_enrolled"]))}'
        )
        self.stdout.write(
            f'   Completed post-op phase:             '
            f'{self.style.SUCCESS(str(enrolment["completed_post_op"]))}'
        )
        self.stdout.write(
            f'   Completed pre-op or later:           {enrolment["completed_pre_op_or_later"]}'
        )
        self.stdout.write(
            f'   Soft-deleted (excluded):             {enrolment["soft_deleted_excluded"]}'
        )
        self.stdout.write('   Breakdown by status:')
        for value, label in Patient.Status.choices:
            self.stdout.write(f'     {label:<28} {enrolment["by_status"][value]}')

        self.stdout.write(
            self.style.MIGRATE_HEADING('\n2. Patient-reported usability (rating 1-5)')
        )
        if usability['n_ratings'] == 0:
            self.stdout.write(self.style.WARNING('   No ratings recorded yet.'))
        else:
            std = usability['std_dev']
            std_text = f' ± {std:.2f}' if std is not None else ''
            mean_text = self.style.SUCCESS('{:.2f}'.format(usability['average_rating']))
            n_ratings = usability['n_ratings']
            self.stdout.write(f'   Mean rating: {mean_text}{std_text} (n = {n_ratings})')
            for value, label in RecordingSession.Phase.choices:
                phase = usability['by_phase'][value]
                avg = phase['average_rating']
                avg_text = f'{avg:.2f}' if avg is not None else '—'
                self.stdout.write(f'     {label:<12} {avg_text} (n = {phase["n_ratings"]})')
            self.stdout.write('   Distribution:')
            for score in range(1, 6):
                self.stdout.write(f'     {score} ★  {usability["distribution"][str(score)]}')
        self.stdout.write(
            f'   Feedback without a usable rating (null or skipped): '
            f'{usability["skipped_or_unrated"]}'
        )

        self.stdout.write(
            self.style.NOTICE(
                '\nPaste these into the Results/Cohort section of '
                'docs/research/abstract-draft.md (replaces the [TBD] placeholders).\n'
            )
        )
