import Main from '../layouts/Main';
import type { BaseViewProps, User } from '../types';

type Props = BaseViewProps & { record: User };

export default function UserShow({ record, ...layout }: Props) {
  const isSelf = layout.currentUser && String(layout.currentUser.id) === String(record.id);

  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex flex-wrap justify-content-between align-items-start mb-3 gap-2">
        <div>
          <h4 className="mb-1">
            {record.username}{' '}
            <span className={`badge ${record.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'}`}>
              {record.status}
            </span>{' '}
            {isSelf && <span className="badge text-bg-info">you</span>}
          </h4>
          <div className="text-muted small">User #{record.id}</div>
        </div>
        <div className="d-flex gap-2">
          <a href={`/users/${record.id}/edit`} className="btn btn-sm btn-outline-secondary">Edit</a>
          {!isSelf && (
            <form method="POST" action={`/users/${record.id}`} data-confirm={`Delete user "${record.username}"?`}>
              <input type="hidden" name="_csrf" value={layout.csrfToken} />
              <input type="hidden" name="_method" value="DELETE" />
              <button className="btn btn-sm btn-outline-danger">Delete</button>
            </form>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-4">Username</dt>
            <dd className="col-sm-8">{record.username}</dd>
            <dt className="col-sm-4">Status</dt>
            <dd className="col-sm-8">{record.status}</dd>
            <dt className="col-sm-4">Created</dt>
            <dd className="col-sm-8">{record.created_at}</dd>
            <dt className="col-sm-4">Updated</dt>
            <dd className="col-sm-8">{record.updated_at}</dd>
          </dl>
          {/* Note what is NOT here: the password. The User type doesn't even have the field,
              so TypeScript would reject an attempt to render it. */}
        </div>
      </div>

      <a href="/users" className="btn btn-sm btn-outline-secondary mt-3">Back to list</a>
    </Main>
  );
}
