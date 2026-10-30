export const EXERCISE_LABEL: Record<string, string> = {
  lecture: 'Lecture à voix haute',
  repetition: 'Répétition sans texte',
  reco: 'Reconnaissance à l’écoute',
  dictee: 'Dictée',
  trous: 'Mots manquants',
  coach: 'Discussion avec le coach',
};

export const minutesSince = (start: number) => Math.max(1, Math.round((Date.now() - start) / 60000));
