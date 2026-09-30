const appointment = /\b(?:appoint(?:ed|ment|s)?|named|newly hired|newly appointed)\b|atan(?:dı|an|ması|ma)|atandı|göreve getir|göreve başladı/i;
const executive = /\b(?:CEO|CFO|CMO|COO|chief executive|chief financial|chief marketing|chief operating|managing director|general manager)\b|genel müdür|icra kurulu başkanı|pazarlama direktör/i;
const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
const isAppointment = value => executive.test(value || '') &&
  (appointment.test(value || '') || /\bnew\s+(?:CEO|CFO|CMO|COO|chief|managing director|general manager)\b|yeni\s+(?:CEO|CFO|CMO|genel müdür|pazarlama direktör)/i.test(value || ''));

export function appointmentEvidence(candidate) {
  if (candidate.observation_type !== 'dated_event') return [];
  const summary = candidate.signal_summary || '';
  const evidence = candidate.evidence || [];
  const facts = evidence.filter(e => isAppointment(e.fact));
  return facts.length ? facts : isAppointment(summary) ? evidence : [];
}

export function prioritizeAppointee(people, evidence, summary = '') {
  if (!evidence.length) return people;
  const namedInEvent = people.some(person => executive.test(person.role || '') &&
    (evidence.some(e => normalize(e.fact).includes(normalize(person.name))) || normalize(summary).includes(normalize(person.name))));
  const ranked = people.map((person, index) => {
    const name = normalize(person.name);
    const cited = evidence.some(e => e.url === person.source_url);
    const named = evidence.some(e => normalize(e.fact).includes(name)) || normalize(summary).includes(name);
    const priority = executive.test(person.role || '') && (named || (!namedInEvent && cited));
    return { person: priority ? { ...person, appointment_target: true } : person,
      rank: priority ? 0 : 1, index };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  // Only the first source-backed appointee is the event's direct contact.
  let selected = false;
  return ranked.map(({ person }) => {
    if (!person.appointment_target) return person;
    if (selected) { const { appointment_target, ...other } = person; return other; }
    selected = true;
    return person;
  });
}
