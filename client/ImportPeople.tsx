import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Field, ErrorBox, Loading, Modal } from './components';
import { personSchema } from '../shared/domain';
const fields: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  full_name: 'Nombre y apellido combinado',
  telefono: 'Teléfono',
  dni: 'DNI',
  email: 'Email',
  direccion: 'Dirección',
  observaciones: 'Observaciones',
};
export function ImportPeople() {
  const [file, setFile] = useState<File>();
  const [sheet, setSheet] = useState('');
  const [headerRow, setHeader] = useState(1);
  const [preview, setPreview] = useState<any>();
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<any>();
  const qc = useQueryClient();
  const load = useMutation({
    mutationFn: async (remap: boolean) => {
      const form = new FormData();
      form.append('file', file!);
      form.append('headerRow', String(headerRow));
      if (sheet) form.append('sheet', sheet);
      if (remap) form.append('mapping', JSON.stringify(mapping));
      return api('/import/preview', 'POST', form);
    },
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.mapping);
      setRows(p.rows.map((r: any) => ({ ...r, reviewed: false, target_id: r.matches[0]?.id })));
      setPage(0);
      setResult(undefined);
    },
  });
  const commit = useMutation({
    mutationFn: () =>
      api('/import/commit', 'POST', {
        rows: rows.map((r) => ({
          person: r.person,
          action: r.action,
          target_id: r.target_id,
          reviewed: true,
        })),
      }),
    onSuccess: (r) => {
      setResult(r);
      setConfirm(false);
      setPreview(undefined);
      setRows([]);
      void qc.invalidateQueries();
    },
  });
  const update = (index: number, patch: any) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch, reviewed: false } : r)));
  const selected = rows.filter((r) => r.action !== 'skip');
  const ready =
    selected.length > 0 &&
    selected.every((r) => r.reviewed && personSchema.safeParse(r.person).success);
  return (
    <>
      <Link className="back" to="/personas">
        ← Personas
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">IMPORTACIÓN ASISTIDA</span>
          <h1>Importar personas</h1>
          <p>
            Seleccioná, revisá las columnas y confirmá cada registro. El archivo original se
            conserva.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="form-grid">
          <Field label="Archivo XLSX o CSV (hasta 5 MB)">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                setPreview(undefined);
                setRows([]);
                setMapping({});
              }}
            />
          </Field>
          <Field label="Fila de encabezados">
            <input
              type="number"
              min="1"
              max="100"
              value={headerRow}
              onChange={(e) => setHeader(Number(e.target.value))}
            />
          </Field>
          {preview?.sheets.length > 0 && (
            <Field label="Hoja">
              <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
                <option value="">Primera hoja</option>
                {preview.sheets.map((s: string) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <p className="info">
          Para PRISMA GESTIÓN: hoja Personas, encabezados en la fila 3. Los pagos y las
          inscripciones del Excel no se migran desde esta pantalla.
        </p>
        <button
          disabled={!file || load.isPending}
          className="primary"
          onClick={() => load.mutate(false)}
        >
          {load.isPending ? 'Leyendo…' : 'Leer archivo'}
        </button>
        <ErrorBox error={load.error} />
      </section>
      {result && (
        <section role="status" className="panel">
          <h2>Importación completada</h2>
          <p>
            {result.created} creadas · {result.updated} actualizadas · {result.skipped} omitidas.
          </p>
          <Link to="/personas">Ver personas →</Link>
        </section>
      )}
      {preview && (
        <>
          <section className="panel">
            <h2>1. Correspondencia de columnas</h2>
            <div className="form-grid">
              {Object.entries(fields).map(([key, label]) => (
                <Field key={key} label={label}>
                  <select
                    value={mapping[key] ?? -1}
                    onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}
                  >
                    <option value={-1}>No importar</option>
                    {preview.headers.map((h: string, i: number) => (
                      <option value={i} key={i}>
                        {i + 1}. {h || '(sin encabezado)'}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button disabled={load.isPending} onClick={() => load.mutate(true)}>
              Aplicar columnas y volver a validar
            </button>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>2. Revisar registros</h2>
              <span className="chip">{rows.length} filas</span>
            </div>
            <p>
              {rows.filter((r) => personSchema.safeParse(r.person).success).length} válidos ·{' '}
              {rows.filter((r) => !personSchema.safeParse(r.person).success).length} incompletos ·{' '}
              {rows.filter((r) => r.matches.length).length} posibles duplicados ·{' '}
              {preview.discarded} filas vacías / sin datos personales descartadas.
            </p>
            <p className="info">
              La separación sugerida usa la última palabra como apellido. Revisá nombres y apellidos
              compuestos. Ninguna fila se confirma automáticamente.
            </p>
            {rows.slice(page * 20, (page + 1) * 20).map((r, offset) => {
              const index = page * 20 + offset;
              const valid = personSchema.safeParse(r.person);
              return (
                <article className="import-row" key={r.line}>
                  <div className="section-heading">
                    <b>Fila {r.line}</b>
                    {r.review && <span className="chip warning">Nombre separado: revisar</span>}
                    {(r.matches.length > 0 || r.duplicate_lines?.length > 0) && (
                      <span className="chip warning">
                        Posible duplicado{' '}
                        {r.duplicate_lines?.length > 0
                          ? `con fila ${r.duplicate_lines.join(', ')}`
                          : ''}
                      </span>
                    )}
                  </div>
                  <div className="form-grid">
                    {Object.entries(fields)
                      .filter(([key]) => key !== 'full_name')
                      .map(([key, label]) => (
                        <Field key={key} label={label}>
                          <input
                            value={r.person[key] || ''}
                            onChange={(e) =>
                              update(index, { person: { ...r.person, [key]: e.target.value } })
                            }
                          />
                        </Field>
                      ))}
                  </div>
                  {r.person.full_name && <small>Original: {r.person.full_name}</small>}
                  {!valid.success && (
                    <p className="error">{valid.error.issues.map((i) => i.message).join(' ')}</p>
                  )}
                  <div className="form-grid">
                    <Field label="Acción">
                      <select
                        value={r.action}
                        onChange={(e) => update(index, { action: e.target.value })}
                      >
                        <option value="skip">Omitir</option>
                        <option value="create">Crear (si no coincide)</option>
                        {r.matches.length > 0 && (
                          <option value="update">Actualizar coincidencia</option>
                        )}
                        <option value="force">Crear igualmente (duplicado intencional)</option>
                      </select>
                    </Field>
                    {r.action === 'update' && (
                      <Field label="Persona a actualizar">
                        <select
                          value={r.target_id}
                          onChange={(e) => update(index, { target_id: Number(e.target.value) })}
                        >
                          {r.matches.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.public_id} {p.nombre} {p.apellido}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </div>
                  {r.action === 'update' && (
                    <p className="warning">
                      Actualizar reemplaza los campos de la persona con esta fila. Los campos
                      opcionales vacíos también reemplazan valores existentes; el contacto de
                      emergencia, estado, inscripciones y pagos se conservan.
                    </p>
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      disabled={!valid.success && r.action !== 'skip'}
                      checked={r.reviewed}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, i) =>
                            i === index ? { ...x, reviewed: e.target.checked } : x,
                          ),
                        )
                      }
                    />{' '}
                    Revisé los datos y la acción de esta fila.
                  </label>
                </article>
              );
            })}
            <div className="pagination">
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </div>
            <div className="actions">
              <span>
                {selected.filter((r) => r.reviewed).length} de {selected.length} filas seleccionadas
                revisadas
              </span>
              <button className="primary" disabled={!ready} onClick={() => setConfirm(true)}>
                Confirmar importación
              </button>
            </div>
          </section>
        </>
      )}
      {load.isPending && <Loading />}
      {confirm && (
        <Modal title="Confirmar importación" close={() => setConfirm(false)}>
          <p>
            Se procesarán {selected.length} personas. Las actualizaciones reemplazan los campos
            personales mostrados. Todas las filas se guardan en una única transacción.
          </p>
          <ErrorBox error={commit.error} />
          <div className="actions">
            <button onClick={() => setConfirm(false)}>Volver a revisar</button>
            <button className="primary" disabled={commit.isPending} onClick={() => commit.mutate()}>
              {commit.isPending ? 'Importando…' : 'Importar ahora'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
