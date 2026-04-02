export interface Exercise {
  id: string;
  title: string;
  description: string;
  exampleAudioUrlFemale?: string;
  exampleAudioUrlMale?: string;
}

export const EXERCISES: Exercise[] = [
  {
    id: 'a_n',
    title: 'Vokal A',
    description: 'Sagen Sie ca. 2 Sekunden ein klares "Aaaaa".',
    exampleAudioUrlFemale: '/examples/female/1-a_n.mp3',
    exampleAudioUrlMale: '/examples/male/4-a_n.mp3'
  },
  /*
  { 
    id: 'a_h', 
    title: 'Hohes A', 
    description: 'Sagen Sie ca. 2 Sekunden ein hohes "Aaaaa".',
    exampleAudioUrlFemale: '/examples/female/1-a_h.mp3',
    exampleAudioUrlMale: '/examples/male/4-a_h.mp3' 
  },  
  {
    id: 'a_l',
    title: 'Tiefes A',
    description: 'Sagen Sie ca. 2 Sekunden ein tiefes "Aaaaa".',
    exampleAudioUrlFemale: '/examples/female/1-a_l.mp3',
    exampleAudioUrlMale: '/examples/male/4-a_l.mp3'
  },
  {
    id: 'a_lhl',
    title: 'Tiefes und Hohes A',
    description: 'Wechseln Sie von einem tiefen zu einem hohen, und dann wieder einem tiefen "Aaaaa".',
    exampleAudioUrlFemale: '/examples/female/1-a_lhl.mp3',
    exampleAudioUrlMale: '/examples/male/4-a_lhl.mp3'
  },
  */
  {
    id: 'i_n',
    title: 'Vokal I',
    description: 'Sagen Sie ca. 2 Sekunden ein klares "Iiiii".',
    exampleAudioUrlFemale: '/examples/female/1-i_n.mp3',
    exampleAudioUrlMale: '/examples/male/4-i_n.mp3'
  },
  /*
  { 
    id: 'i_h', 
    title: 'Hohes I', 
    description: 'Sagen Sie ca. 2 Sekunden ein hohes "Iiiii".',
    exampleAudioUrlFemale: '/examples/female/1-i_h.mp3',
    exampleAudioUrlMale: '/examples/male/4-i_h.mp3'
  },
  {
    id: 'i_l',
    title: 'Tiefes I',
    description: 'Sagen Sie ca. 2 Sekunden ein tiefes "Iiiii".',
    exampleAudioUrlFemale: '/examples/female/1-i_l.mp3',
    exampleAudioUrlMale: '/examples/male/4-i_l.mp3'
  },
  {
    id: 'i_lhl',
    title: 'Tiefes und Hohes I',
    description: 'Wechseln Sie von einem tiefen zu einem hohen, und dann wieder einem tiefen "Iiiii".',
    exampleAudioUrlFemale: '/examples/female/1-i_lhl.mp3',
    exampleAudioUrlMale: '/examples/male/4-i_lhl.mp3'
  },
  */
  {
    id: 'u_n',
    title: 'Vokal U',
    description: 'Sagen Sie ca. 2 Sekunden ein klares "Uuuuu".',
    exampleAudioUrlFemale: '/examples/female/1-u_n.mp3',
    exampleAudioUrlMale: '/examples/male/4-u_n.mp3'
  },
  /*
  { 
    id: 'u_h', 
    title: 'Hohes U', 
    description: 'Sagen Sie ca. 2 Sekunden ein hohes "Uuuuu".',
    exampleAudioUrlFemale: '/examples/female/1-u_h.mp3',
    exampleAudioUrlMale: '/examples/male/4-u_h.mp3 
  },
  {
    id: 'u_l',
    title: 'Tiefes U',
    description: 'Sagen Sie ca. 2 Sekunden ein tiefes "Uuuuu".',
    exampleAudioUrlFemale: '/examples/female/1-u_l.mp3',
    exampleAudioUrlMale: '/examples/male/4-u_l.mp3'
  },
  {
    id: 'u_lhl',
    title: 'Tiefes und Hohes U',
    description: 'Wechseln Sie von einem tiefen zu einem hohen, und dann wieder einem tiefen "Uuuuu".',
    exampleAudioUrlFemale: '/examples/female/1-u_lhl.mp3',
    exampleAudioUrlMale: '/examples/male/4-u_lhl.mp3'
  },
  */
  {
    id: 'phrase',
    title: 'Satz',
    description: 'Bitte lesen Sie den folgenden Satz laut vor: "Guten Morgen, wie geht es Ihnen?"',
    exampleAudioUrlFemale: '/examples/female/1-phrase.mp3',
    exampleAudioUrlMale: '/examples/male/4-phrase.mp3'
  }
  // TODO: Add iau
];
