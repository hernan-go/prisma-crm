import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, FileText, Plus, Upload } from 'lucide-react';
import { api, ApiError, download } from './api';
import {
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  PageHeading,
  SaveButton,
  useDebounce,
} from './components';
import { KnowledgePreview } from './KnowledgePreview';
import {
  documentInput,
  KNOWLEDGE_MAX_BYTES,
  knowledgePillars,
  type KnowledgeCategory,
  type KnowledgeDocument,
  type KnowledgeInput,
  type KnowledgeList,
} from '../shared/knowledge';
import './knowledge.css';

const root = '/knowledge';
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['knowledge'] });
}
function useUnsaved(dirty: boolean) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('knowledge-unsaved', { detail: dirty }));
    return () => {
      window.dispatchEvent(new CustomEvent('knowledge-unsaved', { detail: false }));
    };
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
function formatDate(value: string) {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

export function KnowledgeEditor({
  document,
  initial,
  categories,
  close,
}: {
  document?: KnowledgeDocument;
  initial?: string;
  categories: KnowledgeCategory[];
  close: () => void;
}) {
  const [id] = useState(() => document?.id || crypto.randomUUID());
  const [value, setValue] = useState<KnowledgeInput>({
    title: document?.title || '',
    category_id: document?.category_id ?? null,
    content_md: document?.content_md ?? initial ?? '',
  });
  const [preview, setPreview] = useState(false);
  const [latest, setLatest] = useState<KnowledgeDocument>();
  const refresh = useRefresh();
  const dirty =
    value.title !== (document?.title || '') ||
    value.category_id !== (document?.category_id ?? null) ||
    value.content_md !== (document?.content_md || '');
  useUnsaved(dirty);
  const bytes = new TextEncoder().encode(value.content_md).length;
  const save = useMutation({
    mutationFn: async () => {
      const input = documentInput.parse(value);
      return api<KnowledgeDocument>(
        document ? `${root}/documents/${id}` : `${root}/documents`,
        document ? 'PUT' : 'POST',
        document ? { ...input, expected_revision: document.revision } : { ...input, id },
      );
    },
    onSuccess: async () => {
      await refresh();
      close();
    },
  });
  const current = useMutation({
    mutationFn: () => api<KnowledgeDocument>(`${root}/documents/${id}`),
    onSuccess: setLatest,
  });
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  return (
    <Modal
      title={document ? 'Editar documento' : 'Nuevo documento Markdown'}
      close={close}
      dirtyOverride={dirty}
    >
      <form
        className="knowledge-editor"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset disabled={save.isPending}>
          <div className="knowledge-fields">
            <Field label="Título">
              <input
                required
                maxLength={240}
                value={value.title}
                onChange={(e) => setValue({ ...value, title: e.target.value })}
              />
            </Field>
            <Field label="Categoría">
              <select
                value={value.category_id ?? ''}
                onChange={(e) =>
                  setValue({
                    ...value,
                    category_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Sin categoría</option>
                {categories
                  .filter((c) => !c.archived_at || c.id === value.category_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived_at ? ' · Archivada' : ''}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          {document?.is_active && (
            <p className="warning">Documento activo: guardar actualizará su contenido vigente.</p>
          )}
          <p className="muted">
            Markdown privado · Sin HTML ni imágenes externas · Guardado explícito
          </p>
          <div className="knowledge-mobile-switch">
            <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
              {preview ? 'Volver al editor' : 'Vista previa'}
            </button>
          </div>
          <div className={`knowledge-edit-grid ${preview ? 'show-preview' : ''}`}>
            <div className="knowledge-source">
              <Field label="Contenido Markdown">
                <textarea
                  rows={19}
                  value={value.content_md}
                  onChange={(e) => setValue({ ...value, content_md: e.target.value })}
                  spellCheck
                />
              </Field>
            </div>
            <section className="knowledge-rendered" aria-label="Vista previa Markdown">
              <h3>Vista previa</h3>
              <KnowledgePreview
                content={
                  bytes <= KNOWLEDGE_MAX_BYTES
                    ? value.content_md
                    : 'El contenido supera el límite de vista previa.'
                }
              />
            </section>
          </div>
          <p role="status">
            {bytes.toLocaleString('es-AR')} / {KNOWLEDGE_MAX_BYTES.toLocaleString('es-AR')} bytes ·{' '}
            {dirty ? 'Cambios sin guardar' : 'Sin cambios'}
          </p>
          <ErrorBox
            error={
              bytes > KNOWLEDGE_MAX_BYTES ? new Error('El documento supera 512 KiB.') : save.error
            }
          />
          {conflict && (
            <div className="warning">
              <p>
                Tu texto permanece en el editor. Consultá la versión vigente o descargá tu borrador
                antes de cerrar y volver a abrir el documento.
              </p>
              <button type="button" disabled={current.isPending} onClick={() => current.mutate()}>
                Consultar versión vigente
              </button>
              <button type="button" onClick={() => download(value.content_md, `borrador-${id}.md`)}>
                Descargar borrador
              </button>
              <ErrorBox error={current.error} />
            </div>
          )}
          {latest && (
            <section className="knowledge-conflict">
              <h3>
                Versión vigente {latest.content_version}: {latest.title}
              </h3>
              <p>
                {latest.is_active ? 'Activo' : 'Inactivo'} ·{' '}
                {latest.category_name || 'Sin categoría'}
              </p>
              <KnowledgePreview content={latest.content_md} />
            </section>
          )}
          <div className="actions">
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={
                save.isPending || bytes > KNOWLEDGE_MAX_BYTES || !value.title.trim() || conflict
              }
              type="submit"
            >
              {save.isPending ? 'Guardando…' : 'Guardar documento'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function CategoryForm({ category, close }: { category?: KnowledgeCategory; close: () => void }) {
  const [name, setName] = useState(category?.name || '');
  const [position, setPosition] = useState(category?.position || 1);
  const [archived, setArchived] = useState(Boolean(category?.archived_at));
  const refresh = useRefresh();
  useUnsaved(
    name !== (category?.name || '') ||
      position !== (category?.position || 1) ||
      archived !== Boolean(category?.archived_at),
  );
  const save = useMutation({
    mutationFn: () =>
      api(
        `${root}/categories${category ? `/${category.id}` : ''}`,
        category ? 'PUT' : 'POST',
        category
          ? { name, position, archived, expected_revision: category.revision }
          : { name, position },
      ),
    onSuccess: async () => {
      await refresh();
      close();
    },
  });
  return (
    <Modal title={category ? 'Editar categoría' : 'Nueva categoría'} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nombre">
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Posición">
          <input
            required
            type="number"
            min={1}
            max={1000000}
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
          />
        </Field>
        {category && (
          <label>
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{' '}
            Categoría archivada
          </label>
        )}
        <p>
          Archivar conserva los documentos asociados. Las posiciones iguales se ordenan por nombre.
        </p>
        <ErrorBox error={save.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <SaveButton pending={save.isPending} />
        </div>
      </form>
    </Modal>
  );
}
export function Knowledge() {
  const [q, setQ] = useState('');
  const search = useDebounce(q);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<{ document?: KnowledgeDocument; initial?: string }>();
  const [editCategory, setEditCategory] = useState<{ category?: KnowledgeCategory }>();
  const [showCategories, setShowCategories] = useState(false);
  const [initialize, setInitialize] = useState(false);
  const refresh = useRefresh();
  const params = new URLSearchParams({ q: search, page: String(page) });
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  const list = useQuery({
    queryKey: ['knowledge', 'documents', params.toString()],
    queryFn: () => api<KnowledgeList>(`${root}/documents?${params}`),
  });
  const categories = useQuery({
    queryKey: ['knowledge', 'categories'],
    queryFn: () => api<KnowledgeCategory[]>(`${root}/categories`),
  });
  const state = useQuery({
    queryKey: ['knowledge', 'state'],
    queryFn: () => api<{ initialized: boolean }>(`${root}/state`),
  });
  const open = useMutation({
    mutationFn: (id: string) => api<KnowledgeDocument>(`${root}/documents/${id}`),
    onSuccess: (document) => setEdit({ document }),
  });
  const initializeMutation = useMutation({
    mutationFn: () => api(`${root}/initialize`, 'POST', {}),
    onSuccess: async () => {
      await refresh();
      setInitialize(false);
    },
  });
  const toggle = useMutation({
    mutationFn: (doc: KnowledgeList['rows'][number]) =>
      api(`${root}/documents/${doc.id}/status`, 'PATCH', {
        is_active: !doc.is_active,
        expected_revision: doc.revision,
      }),
    onSuccess: refresh,
    onError: refresh,
  });
  const importing = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > KNOWLEDGE_MAX_BYTES) throw new Error('El documento supera 512 KiB.');
      const body = new FormData();
      body.append('file', file);
      return api<{ content_md: string }>(`${root}/import`, 'POST', body);
    },
    onSuccess: (result) => setEdit({ initial: result.content_md }),
  });
  return (
    <div className="knowledge-page">
      <PageHeading
        title="Centro de Conocimiento Empresarial"
        description="Documentos privados de esta instalación. Independientes de los períodos y todavía sin conexión con el asesor IA."
        eyebrow="KNOW-HOW IA"
      />
      <div className="knowledge-toolbar">
        <button className="primary" onClick={() => setEdit({})}>
          <Plus size={18} /> Nuevo documento
        </button>
        <label className="knowledge-import">
          <Upload size={18} /> Importar .md
          <input
            aria-label="Importar archivo Markdown"
            type="file"
            accept=".md"
            disabled={importing.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importing.mutate(file);
            }}
          />
        </label>
        <button onClick={() => setShowCategories(!showCategories)} aria-expanded={showCategories}>
          Categorías
        </button>
        <button
          disabled={!state.data || state.data.initialized}
          onClick={() => setInitialize(true)}
        >
          <BrainCircuit size={18} />{' '}
          {state.data?.initialized ? 'Pilares creados' : 'Crear documentos pilares'}
        </button>
      </div>
      <ErrorBox
        error={
          list.error ||
          categories.error ||
          state.error ||
          open.error ||
          toggle.error ||
          importing.error
        }
      />
      {importing.isPending && <p role="status">Validando Markdown…</p>}
      {showCategories && (
        <section className="panel knowledge-categories" aria-label="Categorías">
          <div className="knowledge-toolbar">
            <h2>Categorías</h2>
            <button onClick={() => setEditCategory({})}>Nueva categoría</button>
          </div>
          {categories.data?.length === 0 && (
            <Empty>No hay categorías. Podés crear documentos sin categoría.</Empty>
          )}
          {categories.data?.map((c) => (
            <div className="knowledge-category" key={c.id}>
              <span>
                {c.position}. {c.name} {c.archived_at ? '· Archivada' : ''}
              </span>
              <button onClick={() => setEditCategory({ category: c })}>Editar {c.name}</button>
            </div>
          ))}
        </section>
      )}
      <div className="knowledge-filters">
        <Field label="Buscar por título">
          <input
            type="search"
            maxLength={240}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar documentos…"
          />
        </Field>
        <Field label="Categoría">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="none">Sin categoría</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived_at ? ' · Archivada' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </Field>
      </div>
      {list.isPending ? (
        <Loading />
      ) : (
        list.data && (
          <>
            <p className="muted" role="status">
              {list.data.total} {list.data.total === 1 ? 'documento' : 'documentos'}
            </p>
            {!list.data.rows.length && (
              <Empty>
                No hay documentos para esta selección. Creá uno, importá Markdown o inicializá los
                pilares.
              </Empty>
            )}
            <div className="knowledge-list">
              {list.data.rows.map((doc) => (
                <article className="panel knowledge-card" key={doc.id}>
                  <FileText size={22} aria-hidden="true" />
                  <div className="knowledge-card-copy">
                    <h2>{doc.title}</h2>
                    <p>
                      {doc.category_name || 'Sin categoría'} ·{' '}
                      <strong>{doc.is_active ? 'Activo' : 'Inactivo'}</strong>
                    </p>
                    <small>
                      Versión {doc.content_version} · Modificado {formatDate(doc.updated_at)}
                    </small>
                  </div>
                  <div className="actions">
                    <button disabled={open.isPending} onClick={() => open.mutate(doc.id)}>
                      Abrir
                    </button>
                    <button disabled={toggle.isPending} onClick={() => toggle.mutate(doc)}>
                      {doc.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <ExportDocument id={doc.id} />
                  </div>
                </article>
              ))}
            </div>
            <nav className="knowledge-pagination" aria-label="Páginas de documentos">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page}</span>
              <button disabled={page * 30 >= list.data.total} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </nav>
          </>
        )
      )}
      {edit && (
        <KnowledgeEditor
          {...edit}
          categories={categories.data || []}
          close={() => setEdit(undefined)}
        />
      )}
      {editCategory && <CategoryForm {...editCategory} close={() => setEditCategory(undefined)} />}
      {initialize && (
        <Modal title="Crear documentos pilares" close={() => setInitialize(false)}>
          <p>
            Se crearán cinco documentos inactivos con preguntas orientativas, sin información
            empresarial inventada. Esta acción se realiza una sola vez.
          </p>
          <ol>
            {knowledgePillars.map((p) => (
              <li key={p.key}>{p.title}</li>
            ))}
          </ol>
          <ErrorBox error={initializeMutation.error} />
          <div className="actions">
            <button onClick={() => setInitialize(false)}>Cancelar</button>
            <button
              className="primary"
              disabled={initializeMutation.isPending}
              onClick={() => initializeMutation.mutate()}
            >
              Crear documentos pilares
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ExportDocument({ id }: { id: string }) {
  const exportFile = useMutation({
    mutationFn: async () => {
      const result = await fetch(`/api/knowledge/documents/${id}/export`, {
        credentials: 'same-origin',
      });
      if (!result.ok) {
        if (result.status === 401) window.dispatchEvent(new Event('session-expired'));
        throw new Error('No se pudo exportar el documento.');
      }
      download(await result.text(), `knowledge-${id}.md`);
    },
  });
  return (
    <div>
      <button disabled={exportFile.isPending} onClick={() => exportFile.mutate()}>
        Exportar .md
      </button>
      <ErrorBox error={exportFile.error} />
    </div>
  );
}
