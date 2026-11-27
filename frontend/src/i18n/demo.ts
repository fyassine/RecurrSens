/**
 * Strings for the live demo page, in German and English.
 * The rest of the app stays German-only; this dictionary is demo-specific.
 */

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['en', 'de'];

// Each language named in itself, as shown in the switcher.
export const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch' };

export type RecorderMessages = {
  tooQuiet: string;
  micError: string;
  micNotFound: string;
  micInsecure: string;
  micDenied: string;
  holdToRecord: string;
  recording: (time: string) => string;
  listen: string;
  reRecord: string;
  failed: string;
  ready: string;
};

export type DemoStrings = {
  recorder: RecorderMessages;
  subtitle: string;
  exercises: Record<string, { title: string; short: string; description: string }>;
  tooLoud: string;
  tooShort: (seconds: string, min: number) => string;
  analysisFailed: string;
  tooLarge: string;
  analyzing: string;
  recordingOf: (n: number, total: number) => string;
  back: string;
  demographicsHint: string;
  male: string;
  female: string;
  minSeconds: (min: number) => string;
  holdButton: string;
  qualityTitle: string;
  evaluate: string;
  next: string;
  normal: string;
  abnormal: string;
  confidence: string;
  averagedOver: (n: number) => string;
  recordingsDeleted: string;
  again: string;
  footer: string;
  langLabel: string;
  saliency: {
    heading: string;
    pick: string;
    recording: (n: number) => string;
    plotLabel: (label: string, highlighted: boolean) => string;
    modelScore: (percent: string) => string;
    originalCaption: string;
    lessImportant: string;
    moreImportant: string;
    holdOriginal: string;
    howToRead: string;
    howToReadBody: string;
  };
};

const de: DemoStrings = {
  recorder: {
    tooQuiet: 'Die Aufnahme ist zu leise. Bitte sprechen Sie lauter oder näher am Mikrofon.',
    micError:
      'Mikrofonfehler während der Aufnahme. Bitte prüfen Sie das Mikrofon und versuchen Sie es erneut.',
    micNotFound:
      'Mikrofon konnte nicht gefunden werden. Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.',
    micInsecure:
      'Mikrofon erfordert eine sichere Verbindung (HTTPS). Bitte verwenden Sie https://recurrsens.eu',
    micDenied:
      'Zugriff auf das Mikrofon wurde verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.',
    holdToRecord: 'Gedrückt halten zum Aufnehmen',
    recording: (time) => `Aufnahme läuft… (${time})`,
    listen: 'Anhören',
    reRecord: 'Neu aufnehmen',
    failed: 'Aufnahme fehlgeschlagen',
    ready: 'Aufnahme bereit',
  },
  subtitle: 'Live-Demo',
  exercises: {
    i_n: {
      title: 'Vokal I (normale Tonlage)',
      short: 'Vokal I',
      description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Iiiii" in normaler Tonlage.',
    },
    a_n: {
      title: 'Vokal A (normale Tonlage)',
      short: 'Vokal A',
      description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Aaaaa" in normaler Tonlage.',
    },
    u_n: {
      title: 'Vokal U (normale Tonlage)',
      short: 'Vokal U',
      description: 'Sagen Sie ca. 2 Sekunden lang ein klares "Uuuuu" in normaler Tonlage.',
    },
  },
  tooLoud: 'Die Aufnahme ist zu laut und übersteuert. Bitte etwas mehr Abstand zum Mikrofon.',
  tooShort: (seconds, min) =>
    `Die Aufnahme ist zu kurz (${seconds}s). Bitte mindestens ${min} Sekunden aufnehmen.`,
  analysisFailed: 'Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
  tooLarge: 'Die Aufnahme ist zu groß. Bitte versuchen Sie es erneut.',
  analyzing: 'Aufnahmen werden analysiert…',
  recordingOf: (n, total) => `Aufnahme ${n} von ${total}`,
  back: 'Zurück',
  demographicsHint: 'Für eine genauere Analyse: Geschlecht und Altersgruppe',
  male: 'Männlich',
  female: 'Weiblich',
  minSeconds: (min) => `Mind. ${min} Sek. · Aufnahmetaste gedrückt halten`,
  holdButton: 'Original gedrückt halten',
  qualityTitle: 'Aufnahmequalität nicht ausreichend',
  evaluate: 'Auswerten',
  next: 'Weiter',
  normal: 'Unauffälliger Befund',
  abnormal: 'Auffälliger Befund',
  confidence: 'Konfidenz des Modells',
  averagedOver: (n) => `Gemittelt über ${n} Aufnahmen (I, A, U)`,
  recordingsDeleted:
    'Ihre Aufnahmen wurden nur im Arbeitsspeicher verarbeitet und sind bereits gelöscht.',
  again: 'Nochmal',
  footer:
    'Demonstration ohne diagnostische Aussagekraft. Aufnahmen werden nicht gespeichert.',
  langLabel: 'Sprache',
  saliency: {
    heading: 'Worauf das Modell geachtet hat',
    pick: 'Aufnahme wählen',
    recording: (n) => `Aufnahme ${n}`,
    plotLabel: (label, highlighted) =>
      `Spektrogramm ${label}${highlighted ? ' mit hervorgehobenen Bereichen' : ''}`,
    modelScore: (percent) => `Modellwert dieser Aufnahme: ${percent} %`,
    originalCaption: 'Original: Spektrogramm Ihrer Aufnahme ohne Hervorhebung',
    lessImportant: 'weniger wichtig',
    moreImportant: 'wichtiger',
    holdOriginal: 'Original gedrückt halten',
    howToRead: 'Wie lese ich das?',
    howToReadBody:
      'Das Spektrogramm zeigt Ihre Stimme: Zeit von links nach rechts, Frequenz (kHz) von unten nach oben. Helle Bereiche im Bild markieren, was die Entscheidung des Modells am stärksten beeinflusst hat. Halten Sie die Taste gedrückt, um das unveränderte Original zu sehen.',
  },
};

const en: DemoStrings = {
  recorder: {
    tooQuiet: 'The recording is too quiet. Please speak louder or closer to the microphone.',
    micError: 'Microphone error during recording. Please check your microphone and try again.',
    micNotFound: 'No microphone found. Please make sure a microphone is connected.',
    micInsecure:
      'The microphone requires a secure connection (HTTPS). Please use https://recurrsens.eu',
    micDenied: 'Microphone access was denied. Please allow access in your browser settings.',
    holdToRecord: 'Press and hold to record',
    recording: (time) => `Recording… (${time})`,
    listen: 'Play back',
    reRecord: 'Record again',
    failed: 'Recording failed',
    ready: 'Recording ready',
  },
  subtitle: 'Live demo',
  exercises: {
    i_n: {
      title: 'Vowel I (normal pitch)',
      short: 'Vowel I',
      description: 'Say a clear "eeee" (as in "see") for about 2 seconds at your normal pitch.',
    },
    a_n: {
      title: 'Vowel A (normal pitch)',
      short: 'Vowel A',
      description: 'Say a clear "aaaa" (as in "father") for about 2 seconds at your normal pitch.',
    },
    u_n: {
      title: 'Vowel U (normal pitch)',
      short: 'Vowel U',
      description: 'Say a clear "oooo" (as in "boot") for about 2 seconds at your normal pitch.',
    },
  },
  tooLoud: 'The recording is too loud and distorted. Please move a little further from the microphone.',
  tooShort: (seconds, min) =>
    `The recording is too short (${seconds}s). Please record at least ${min} seconds.`,
  analysisFailed: 'The analysis failed. Please try again.',
  tooLarge: 'The recording is too large. Please try again.',
  analyzing: 'Analysing recordings…',
  recordingOf: (n, total) => `Recording ${n} of ${total}`,
  back: 'Back',
  demographicsHint: 'For a more accurate analysis: sex and age group',
  male: 'Male',
  female: 'Female',
  minSeconds: (min) => `At least ${min} s · press and hold the record button`,
  holdButton: 'Hold to see original',
  qualityTitle: 'Recording quality insufficient',
  evaluate: 'Analyse',
  next: 'Next',
  normal: 'Normal finding',
  abnormal: 'Abnormal finding',
  confidence: 'Model confidence',
  averagedOver: (n) => `Averaged over ${n} recordings (I, A, U)`,
  recordingsDeleted:
    'Your recordings were processed in memory only and have already been deleted.',
  again: 'Start over',
  footer:
    'Demonstration without diagnostic value. Recordings are not stored.',
  langLabel: 'Language',
  saliency: {
    heading: 'What the model focused on',
    pick: 'Choose recording',
    recording: (n) => `Recording ${n}`,
    plotLabel: (label, highlighted) =>
      `Spectrogram ${label}${highlighted ? ' with highlighted regions' : ''}`,
    modelScore: (percent) => `Model score for this recording: ${percent} %`,
    originalCaption: 'Original: spectrogram of your recording without highlighting',
    lessImportant: 'less important',
    moreImportant: 'more important',
    holdOriginal: 'Hold to see original',
    howToRead: 'How do I read this?',
    howToReadBody:
      'The spectrogram shows your voice: time runs left to right, frequency (kHz) bottom to top. Bright areas mark what influenced the model’s decision most. Hold the button to see the unmodified original.',
  },
};

export const STRINGS: Record<Lang, DemoStrings> = { de, en };

const isLang = (value: string | null | undefined): value is Lang =>
  !!value && (LANGS as string[]).includes(value);

/**
 * Initial language: `?lang=de|en` → saved choice → English.
 */
export function resolveInitialLang(search: string, saved: string | null): Lang {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  if (isLang(saved)) return saved;
  return 'en';
}
