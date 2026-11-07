type PersonName = { apellido?: string; nombre?: string };

export function personName(person: PersonName) {
  return [person.apellido, person.nombre].filter(Boolean).join(', ');
}

export function comparePeople(a: PersonName, b: PersonName) {
  return (
    (a.apellido ?? '').localeCompare(b.apellido ?? '', 'es', { sensitivity: 'base' }) ||
    (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' })
  );
}
