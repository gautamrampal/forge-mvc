import Main from '../layouts/Main';
import type { BaseViewProps, Paginated } from '../types';

type Record__Name__ = { id: number | string; created_at?: string; [key: string]: unknown };
type Props = BaseViewProps & Paginated<Record__Name__> & { q?: string };

export default function __Name__Index({ rows, page, total, totalPages, q = '', ...layout }: Props) {
  // Pagination links must carry the search, or "page 2" silently returns page 2 of everything.
  const pageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(p));
    return `/__kebab__?${params.toString()}`;
  };

  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <h4 className="mb-0">__Name__s</h4>
        <a href="/__kebab__/create" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg me-1" />
          New __Name__
        </a>
      </div>

      {/* GET so results stay linkable and the back button works; no CSRF needed.
          Add `static searchable = ['name']` to the model to make this do something. */}
      <form method="GET" action="/__kebab__" className="row g-2 mb-3">
        <div className="col-12 col-sm-5 col-md-4">
          <input type="search" name="q" className="form-control form-control-sm"
                 placeholder="Search…" defaultValue={q} />
        </div>
        <div className="col-auto">
          <button type="submit" className="btn btn-sm btn-outline-primary">Search</button>
        </div>
        {q && (
          <div className="col-auto">
            <a href="/__kebab__" className="btn btn-sm btn-outline-secondary">Clear</a>
          </div>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">
            {q ? (
              <>
                <p>No __Name__s match your search.</p>
                <a href="/__kebab__" className="btn btn-outline-secondary btn-sm">Clear search</a>
              </>
            ) : (
              <>
                <p>No __Name__s yet.</p>
                <a href="/__kebab__/create" className="btn btn-primary btn-sm">
                  Create your first __Name__
                </a>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>ID</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={String(record.id)}>
                      <td>
                        <a href={`/__kebab__/${record.id}`}>#{record.id}</a>
                      </td>
                      <td className="small text-muted">{record.created_at}</td>
                      <td className="text-end">
                        <a href={`/__kebab__/${record.id}/edit`} className="btn btn-sm btn-outline-secondary">
                          Edit
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-muted small mt-2">
            Page {page} of {totalPages} ({total} total)
          </p>
        </>
      )}
    </Main>
  );
}
