"""Whitelist + validators for audio uploads.

Single source of truth for which audio formats this app accepts. Used by all
three upload views in views.py (server-side upload, pre-sign URL generation,
pre-sign confirm).

Strategy: sniff the format from the file's magic bytes first and trust that
over the (client-controlled) filename. This makes mislabeled uploads
self-correct — e.g. iOS WebKit records audio/mp4 but a client may name the part
`recording.webm`; we detect the MP4 `ftyp` box and store it as `.mp4` instead of
rejecting it. Formats without a reliable universal signature (.nsp KayPENTAX,
.caf, .3gp, .amr, .aiff) cannot be sniffed, so they fall back to the
extension + MIME whitelist — rejecting them would block real clinical and mobile
uploads. A file whose extension claims a *signed* format but whose bytes match no
known signature is rejected as corrupt/mismatched.
"""
from dataclasses import dataclass

from django.core.exceptions import ValidationError


MAX_AUDIO_BYTES = 50 * 1024 * 1024


@dataclass(frozen=True)
class AudioFormat:
    extensions: tuple[str, ...]
    mimes: tuple[str, ...]
    # Each signature is (offset, byte_prefix). None disables magic-byte check.
    magic_signatures: tuple[tuple[int, bytes], ...] | None


ALLOWED_AUDIO_FORMATS: tuple[AudioFormat, ...] = (
    AudioFormat(
        extensions=('webm',),
        mimes=('audio/webm',),
        magic_signatures=((0, b'\x1a\x45\xdf\xa3'),),  # EBML
    ),
    AudioFormat(
        extensions=('mp4', 'm4a', 'aac'),
        mimes=('audio/mp4', 'audio/aac', 'audio/x-m4a'),
        # MP4/M4A: 'ftyp' box at offset 4. AAC ADTS: 0xFFF1 or 0xFFF9 at offset 0.
        magic_signatures=(
            (4, b'ftyp'),
            (0, b'\xff\xf1'),
            (0, b'\xff\xf9'),
        ),
    ),
    AudioFormat(
        extensions=('wav',),
        mimes=('audio/wav', 'audio/x-wav'),
        # RIFF....WAVE — check RIFF at 0 and WAVE at 8.
        magic_signatures=((0, b'RIFF'),),
    ),
    AudioFormat(
        extensions=('mp3',),
        mimes=('audio/mpeg', 'audio/mp3'),
        # ID3 tag, or MPEG frame sync 0xFFFB / 0xFFF3 / 0xFFF2.
        magic_signatures=(
            (0, b'ID3'),
            (0, b'\xff\xfb'),
            (0, b'\xff\xf3'),
            (0, b'\xff\xf2'),
        ),
    ),
    AudioFormat(
        extensions=('ogg', 'oga'),
        mimes=('audio/ogg',),
        magic_signatures=((0, b'OggS'),),
    ),
    AudioFormat(
        extensions=('flac',),
        mimes=('audio/flac', 'audio/x-flac'),
        magic_signatures=((0, b'fLaC'),),
    ),
    AudioFormat(
        extensions=('3gp', '3gpp'),
        mimes=('audio/3gpp',),
        magic_signatures=None,
    ),
    AudioFormat(
        extensions=('amr',),
        mimes=('audio/amr',),
        magic_signatures=None,
    ),
    AudioFormat(
        extensions=('caf',),
        mimes=('audio/x-caf',),
        magic_signatures=None,
    ),
    AudioFormat(
        extensions=('aiff', 'aif'),
        mimes=('audio/aiff', 'audio/x-aiff'),
        magic_signatures=None,
    ),
    AudioFormat(
        extensions=('nsp',),
        mimes=('application/octet-stream',),
        magic_signatures=None,
    ),
)


ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    ext for fmt in ALLOWED_AUDIO_FORMATS for ext in fmt.extensions
)

_EXT_TO_FORMAT: dict[str, AudioFormat] = {
    ext: fmt for fmt in ALLOWED_AUDIO_FORMATS for ext in fmt.extensions
}

_MIME_TO_EXT: dict[str, str] = {
    mime: fmt.extensions[0] for fmt in ALLOWED_AUDIO_FORMATS for mime in fmt.mimes
}


def extension_for_content_type(content_type: str) -> str | None:
    """Return the canonical extension for a given MIME, or None if unsupported."""
    if not content_type:
        return None
    return _MIME_TO_EXT.get(content_type.lower())


def canonical_extension(filename: str) -> str | None:
    """Return the lowercase extension if whitelisted, else None."""
    if not filename or '.' not in filename:
        return None
    ext = filename.rsplit('.', 1)[-1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else None


def _detect_format_by_magic(head: bytes) -> AudioFormat | None:
    """Return the AudioFormat whose magic signature matches *head*, or None."""
    for fmt in ALLOWED_AUDIO_FORMATS:
        if fmt.magic_signatures is None:
            continue
        if any(
            head[offset:offset + len(prefix)] == prefix
            for offset, prefix in fmt.magic_signatures
        ):
            return fmt
    return None


def validate_audio_upload(file_obj) -> tuple[str, str]:
    """Validate an uploaded file. Returns (canonical_extension, canonical_mime).

    Sniffs the format from the file's magic bytes and trusts that over the
    client-supplied filename, so a mislabeled upload self-corrects to the format
    its bytes actually are. Falls back to the filename extension only for
    signature-less formats. Raises django.core.exceptions.ValidationError if the
    file is rejected. Leaves the file pointer at position 0 for callers.
    """
    size = getattr(file_obj, 'size', None)
    if size is not None and size > MAX_AUDIO_BYTES:
        raise ValidationError(
            f'Datei zu groß (max. {MAX_AUDIO_BYTES // (1024 * 1024)} MB).'
        )

    head = file_obj.read(16)
    file_obj.seek(0)

    name_ext = canonical_extension(getattr(file_obj, 'name', '') or '')

    detected = _detect_format_by_magic(head)
    if detected is not None:
        # Trust the bytes over the filename. Keep the client's extension when it
        # already belongs to the detected format; otherwise use the format's
        # canonical extension so the stored key reflects the real content.
        ext = name_ext if name_ext in detected.extensions else detected.extensions[0]
        return ext, detected.mimes[0]

    # No recognisable signature. Fall back to the filename extension, but only
    # for formats we never had a way to verify. A file whose extension claims a
    # signed format yet whose bytes match no signature is rejected.
    if name_ext is None:
        raise ValidationError('Nicht unterstütztes Audioformat.')

    fmt = _EXT_TO_FORMAT[name_ext]
    if fmt.magic_signatures is not None:
        raise ValidationError('Dateiinhalt entspricht nicht dem Audioformat.')

    return name_ext, fmt.mimes[0]
