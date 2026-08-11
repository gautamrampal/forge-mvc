import Main from '../layouts/Main';
import type { BaseViewProps, Paginated, User } from '../types';

type Props = BaseViewProps & Paginated<User> & { filterStatus: string; q: string };

export default function UsersIndex({ rows, page, total, totalPages, filterStatus, q, ...layout }: Props) {
  const isSelf = (id: User['id']) => layout.currentUser && String(layout.currentUser.id) === String(id);
  const hasFilters = Boolean(q || filterStatus);

  // Every pagination link has to carry the current search + filter, or clicking "page 2"
  // silently resets them and the user loses their place.
  const pageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    params.set('page', String(p));
    return `/users?${params.toString()}`;
  };

  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <h4 className="mb-0">
          Users <span className="badge text-bg-secondary">{total}</span>
        </h4>
        <a href="/users/create" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg me-1" />
          New user
        </a>
      </div>

      {/* GET, not POST: search results should be linkable, shareable and back-button friendly.
          A GET form also needs no CSRF token, since it changes nothing. */}
      <form method="GET" action="/users" className="row g-2 mb-3">
        <div className="col-12 col-sm-5 col-md-4">
          <div className="input-group input-group-sm">
            <span className="input-group-text">
              <i className="bi bi-search" />
            </span>
            <input
              type="search"
              name="q"
              className="form-control"
              placeholder="Search username…"
              defaultValue={q}
              aria-label="Search users"
            />
          </div>
        </div>
        <div className="col-6 col-sm-3 col-md-2">
          <select
            name="status"
            className="form-select form-select-sm"
            defaultValue={filterStatus}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="col-auto">
          <button type="submit" className="btn btn-sm btn-outline-primary">Search</button>
        </div>
        {hasFilters && (
          <div className="col-auto">
            <a href="/users" className="btn btn-sm btn-outline-secondary">Clear</a>
          </div>
        )}
      </form>

      {hasFilters && (
        <p className="text-muted small">
          {total} result{total === 1 ? '' : 's'}
          {q && <> for “<strong>{q}</strong>”</>}
          {filterStatus && <> with status <strong>{filterStatus}</strong></>}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-muted py-5">
            {/* "Nothing matched your search" is a different situation from "you have no users",
                and needs a different way out. */}
            {hasFilters ? (
              <>
                <p className="mb-3">No users match your search.</p>
                <a href="/users" className="btn btn-outline-secondary btn-sm">Clear search</a>
              </>
            ) : (
              <>
                <p className="mb-3">No users yet.</p>
                <a href="/users/create" className="btn btn-primary btn-sm">Create a user</a>
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
                    <th>Username</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={String(record.id)}>
                      <td>
                        <a href={`/users/${record.id}`}>{record.username}</a>
                        {isSelf(record.id) && <span className="badge text-bg-info ms-1">you</span>}
                      </td>
                      <td>
                        <span className={`badge ${record.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="small text-muted">{record.created_at}</td>
                      <td className="text-end">
                        <a href={`/users/${record.id}/edit`} className="btn btn-sm btn-outline-secondary">
                          Edit
                        </a>{' '}
                        {!isSelf(record.id) && (
                          <form
                            method="POST"
                            action={`/users/${record.id}`}
                            className="d-inline"
                            data-confirm={`Delete user "${record.username}"?`}
                          >
                            <input type="hidden" name="_csrf" value={layout.csrfToken} />
                            <input type="hidden" name="_method" value="DELETE" />
                            <button className="btn btn-sm btn-outline-danger">Delete</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <nav className="mt-3" aria-label="Pagination">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
                  <a className="page-link" href={pageUrl(page - 1)}>Previous</a>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                    <a className="page-link" href={pageUrl(p)}>{p}</a>
                  </li>
                ))}
                <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
                  <a className="page-link" href={pageUrl(page + 1)}>Next</a>
                </li>
              </ul>
            </nav>
          )}
          <p className="text-muted small mt-2">
            Page {page} of {totalPages} · {total} user(s)
          </p>
        </>
      )}
    </Main>
  );
}
