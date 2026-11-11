export const MAX_CAPACITY = 20;
const statuses = ['pendente', 'confirmado', 'recusado'];
export function validateInvite(row) {
  if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id)) throw Error('Identificador de convite inválido.');
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 100) throw Error('Informe um nome de até 100 caracteres.');
  if (!Number.isInteger(row.capacity) || row.capacity < 1 || row.capacity > MAX_CAPACITY) throw Error('Use de 1 a 20 vagas totais, incluindo o titular.');
  return { id: row.id, name: row.name.trim(), capacity: row.capacity };
}
export function inviteLink(base, row) {
  const invite = validateInvite(row);
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...invite }));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL(base); url.search = ''; url.hash = ''; url.searchParams.set('convite', token);
  return url.href;
}
export function readInvite(url) {
  const token = new URL(url).searchParams.get('convite');
  if (!token) return null;
  if (token.length > 4096 || !/^[\w-]+$/.test(token)) throw Error('Este link de convite está incompleto ou inválido.');
  try {
    const normalized = token.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    if (data.v !== 1) throw Error();
    return validateInvite(data);
  } catch { throw Error('Este link de convite está incompleto ou inválido. Peça o link novamente aos noivos.'); }
}
export function validatePeople(invite, people) {
  if (!Array.isArray(people) || people.length !== invite.capacity) throw Error('Confira as pessoas incluídas neste convite.');
  const normalized = people.map((p, i) => {
    if (!p || !['vai', 'nao', 'pendente'].includes(p.status)) throw Error('Responda por cada pessoa.');
    const name = String(p.name ?? '').trim();
    if (name.length > 100) throw Error('Use nomes com até 100 caracteres.');
    if (i === 0 && name !== invite.name) throw Error('O nome do titular deve corresponder ao convite.');
    if (p.status === 'vai' && !name) throw Error('Escreva o nome de cada acompanhante que vai comparecer.');
    return { name, status: p.status };
  });
  const present = normalized.filter(p => p.status === 'vai').map(p => p.name.toLocaleLowerCase('pt-BR'));
  if (new Set(present).size !== present.length) throw Error('Há nomes repetidos entre as pessoas que vão. Confira antes de continuar.');
  return normalized;
}
export function rsvpMessage(invite, people, couple, date) {
  const checked = validatePeople(invite, people);
  const lines = checked.map((p, i) => `• ${p.name || `Acompanhante ${i}`}: ${{vai:'vai comparecer',nao:'não vai comparecer',pendente:'ainda pendente'}[p.status]}`);
  return `Olá! Sou ${invite.name}. Esta é minha resposta ao convite de ${couple}, em ${date}:\n\n${lines.join('\n')}\n\nTotal que vai comparecer: ${checked.filter(p=>p.status==='vai').length}.\nConvite: ${invite.id} · até ${invite.capacity} pessoa(s), incluindo o titular.\n\nPor favor, confiram e registrem a resposta na lista dos noivos.`;
}
export function whatsappLink(phone, message) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}
export function normalizePhone(phone) {
  const input=String(phone||'').trim();
  if (!/^\+?[\d\s().-]+$/.test(input)) throw Error('O WhatsApp de destino ainda precisa ser configurado.');
  const digits=input.replace(/\D/g,'');
  if(!/^\d{10,15}$/.test(digits)) throw Error('Use código do país, DDD e número no WhatsApp.');
  return digits;
}
export function validateRow(row) {
  const invite = validateInvite(row);
  if (!statuses.includes(row.status) || !Number.isInteger(row.confirmed) || row.confirmed < 0 || row.confirmed > invite.capacity) throw Error('Quantidade confirmada inválida para este convite.');
  if (row.status !== 'confirmado' && row.confirmed !== 0) throw Error('Convites pendentes ou recusados devem ter zero pessoas confirmadas.');
  if (row.status === 'confirmado' && row.confirmed === 0) throw Error('Um convite confirmado precisa de pelo menos uma pessoa.');
  return {...invite, status: row.status, confirmed: row.confirmed};
}
export function adminTotals(rows) {
  return rows.reduce((total, raw) => {
    const row = validateRow(raw); total.invites++; total.capacity += row.capacity; total.confirmed += row.confirmed; total[row.status]++; return total;
  }, { invites:0, capacity:0, confirmed:0, pendente:0, confirmado:0, recusado:0 });
}
export function parseBackup(text) {
  if (text.length > 2_000_000) throw Error('Backup muito grande.');
  let backup; try { backup = JSON.parse(text); } catch { throw Error('O arquivo não contém JSON válido.'); }
  if (backup.version !== 1 || !Array.isArray(backup.rows) || backup.rows.length > 5000) throw Error('Formato de backup não reconhecido.');
  const rows = backup.rows.map(validateRow);
  if (new Set(rows.map(r=>r.id)).size !== rows.length) throw Error('O backup possui identificadores repetidos.');
  return rows;
}
export function csvCell(value) {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
