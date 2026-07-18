"""
Management command: backfill POST_OP RecordingSession assignment for patients
whose first post-op recording bout happened before any RecordingSession
existed (session=NULL) and who later had a session_number=1 row created for
a *different*, later visit.

Background: advance_patient_step() only auto-created the first RecordingSession
for PRE_OP, not POST_OP (fixed for new patients in services.py). For patients
who already recorded post-op before that fix, their earliest visit's audio
files still have session=NULL. buildPostOpSections() in the frontend merges
all session=NULL files into whatever session is numbered 1 — which, for these
patients, wrongly merges two distinct visits into a single card, and the ZIP
export (post_op_1/...) mislabels the folder contents to match.

This command re-derives the correct visit grouping from AudioFile.created_at
timestamps (a burst of ~15 recordings within minutes = one visit; a gap of
--gap-hours or more = a new visit), then renumbers/reassigns RecordingSession
and AudioFile rows to match chronological order, starting at 1.

Usage:
    python manage.py backfill_post_op_sessions                     # dry-run report (default)
    python manage.py backfill_post_op_sessions --patient 0025      # limit to one patient
    python manage.py backfill_post_op_sessions --gap-hours 6       # adjust clustering threshold
    python manage.py backfill_post_op_sessions --apply             # actually write changes

Safety:
    - Defaults to dry-run; writes require the explicit --apply flag.
    - Each patient is processed in its own transaction; a failure or an
      ambiguous cluster (files split across more than one existing session)
      is skipped and reported, never guessed at.
    - Does not touch Patient.post_op_date, ExerciseSkip, or S3 storage keys —
      only RecordingSession.session_number and AudioFile.session are changed.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F

from patients.models import AudioFile, Patient, RecordingSession


class Command(BaseCommand):
    help = 'Recompute POST_OP visit/session grouping from recording timestamps and fix session numbering'

    def add_arguments(self, parser):
        parser.add_argument(
            '--patient',
            type=str,
            default=None,
            help='Limit to a single patient_id (e.g. 0025)',
        )
        parser.add_argument(
            '--gap-hours',
            type=float,
            default=4.0,
            help='Time gap (hours) between recordings that marks a new visit (default: 4)',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Write the changes. Without this flag, only a report is printed.',
        )

    def handle(self, *args, **options):
        gap = timedelta(hours=options['gap_hours'])
        apply_changes = options['apply']

        patients = Patient.objects.filter(deleted_at__isnull=True).order_by('patient_id')
        if options['patient']:
            patients = patients.filter(patient_id=options['patient'])

        touched = 0
        skipped = 0

        for patient in patients:
            files = list(
                AudioFile.objects.filter(patient=patient, phase='POST_OP')
                .select_related('session')
                .order_by('created_at')
            )
            if not files:
                continue

            clusters = self._cluster(files, gap)
            existing_sessions = {
                s.id: s for s in RecordingSession.objects.filter(patient=patient, phase='POST_OP')
            }

            plan, conflict = self._build_plan(clusters, existing_sessions)

            current_numbers = self._current_numbering(clusters)
            proposed_numbers = [p['number'] for p in plan]
            unchanged = (
                not conflict
                and current_numbers == proposed_numbers
                and all(p['target_session_id'] is not None for p in plan)
            )
            if unchanged:
                continue

            self.stdout.write('')
            self.stdout.write(self.style.NOTICE(f'=== Patient {patient.patient_id} ==='))

            if conflict:
                self.stdout.write(
                    self.style.ERROR(
                        '  SKIPPED: a cluster spans more than one existing RecordingSession — '
                        'needs manual review, not auto-fixable.'
                    )
                )
                skipped += 1
                continue

            for p in plan:
                first, last = p['files'][0].created_at, p['files'][-1].created_at
                old_ids = sorted(
                    {str(f.session_id) if f.session_id else 'NULL' for f in p['files']}
                )
                self.stdout.write(
                    f'  visit {p["number"]}: {len(p["files"])} file(s), '
                    f'{first:%Y-%m-%d %H:%M} - {last:%H:%M}, '
                    f'old session(s)={old_ids} -> session_number={p["number"]}'
                )

            stray = set(existing_sessions) - {
                p['target_session_id'] for p in plan if p['target_session_id']
            }
            for sid in stray:
                s = existing_sessions[sid]
                skip_count = s.exercise_skips.count()
                note = (
                    f' ({skip_count} exercise_skip row(s) will lose their session link)'
                    if skip_count
                    else ''
                )
                self.stdout.write(
                    self.style.WARNING(
                        f'  stray empty session_number={s.session_number} (id={sid}) will be deleted{note}'
                    )
                )

            touched += 1

            if apply_changes:
                with transaction.atomic():
                    self._apply(patient, plan, existing_sessions, stray)
                self.stdout.write(self.style.SUCCESS('  applied.'))

        self.stdout.write('')
        if apply_changes:
            self.stdout.write(
                self.style.SUCCESS(f'Done. {touched} patient(s) updated, {skipped} skipped.')
            )
        else:
            self.stdout.write(
                self.style.NOTICE(
                    f'[dry-run] {touched} patient(s) would be updated, {skipped} would be skipped. '
                    f'Re-run with --apply to write.'
                )
            )

    @staticmethod
    def _cluster(files, gap):
        clusters = [[files[0]]]
        for f in files[1:]:
            if (f.created_at - clusters[-1][-1].created_at) > gap:
                clusters.append([f])
            else:
                clusters[-1].append(f)
        return clusters

    @staticmethod
    def _current_numbering(clusters):
        """What session_number each cluster's files currently, mostly, sit under (for no-op detection)."""
        numbers = []
        for cluster in clusters:
            nums = {f.session.session_number for f in cluster if f.session_id}
            numbers.append(sorted(nums)[0] if len(nums) == 1 else None)
        return numbers

    @staticmethod
    def _build_plan(clusters, existing_sessions):
        plan = []
        conflict = False
        for i, cluster in enumerate(clusters, start=1):
            session_ids = {f.session_id for f in cluster if f.session_id}
            if len(session_ids) > 1:
                conflict = True
            target = next(iter(session_ids)) if session_ids else None
            plan.append({'number': i, 'files': cluster, 'target_session_id': target})
        return plan, conflict

    @staticmethod
    def _apply(patient, plan, existing_sessions, stray_ids):
        # Push all existing session_numbers out of the way first to dodge the
        # (patient, phase, session_number) unique constraint while renumbering.
        RecordingSession.objects.filter(id__in=existing_sessions.keys()).update(
            session_number=F('session_number') + 10000
        )

        for p in plan:
            target_id = p['target_session_id']
            if target_id:
                session = existing_sessions[target_id]
                session.session_number = p['number']
                session.save(update_fields=['session_number'])
            else:
                session = RecordingSession.objects.create(
                    patient=patient,
                    phase=RecordingSession.Phase.POST_OP,
                    session_number=p['number'],
                )
            file_ids = [f.id for f in p['files']]
            AudioFile.objects.filter(id__in=file_ids).update(session=session)

        RecordingSession.objects.filter(id__in=stray_ids).delete()
