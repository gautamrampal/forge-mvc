import Main from '../layouts/Main';
import type { BaseViewProps, FormErrors, User } from '../types';

type Props = BaseViewProps & {
  record: Partial<User>;
  formErrors: FormErrors;
};

export default function UserForm({ record = {}, formErrors = {}, ...layout }: Props) {
  const isEdit = Boolean(record.id);

  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">{layout.title}</h4>
        <a href="/users" className="btn btn-sm btn-outline-secondary">Back to list</a>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body">
          <form method="POST" action={isEdit ? `/users/${record.id}` : '/users'} noValidate>
            <input type="hidden" name="_csrf" value={layout.csrfToken} />
            {isEdit && <input type="hidden" name="_method" value="PUT" />}

            <div className="mb-3">
              <label className="form-label" htmlFor="username">Username *</label>
              {/* defaultValue, not value — a `value` without onChange makes React treat the
                  input as controlled and read-only. */}
              <input
                type="text"
                id="username"
                name="username"
                className={`form-control ${formErrors.username ? 'is-invalid' : ''}`}
                defaultValue={record.username || ''}
                required
                minLength={3}
                maxLength={50}
                autoFocus
              />
              {formErrors.username && <div className="invalid-feedback d-block">{formErrors.username}</div>}
              <div className="form-text">Letters, numbers, dots, underscores and hyphens.</div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="password">Password {isEdit ? '' : '*'}</label>
              <input
                type="password"
                id="password"
                name="password"
                className={`form-control ${formErrors.password ? 'is-invalid' : ''}`}
                required={!isEdit}
                minLength={8}
                autoComplete="new-password"
              />
              {formErrors.password && <div className="invalid-feedback d-block">{formErrors.password}</div>}
              <div className="form-text">
                {isEdit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="status">Status *</label>
              <select
                id="status"
                name="status"
                className={`form-select ${formErrors.status ? 'is-invalid' : ''}`}
                defaultValue={record.status || 'active'}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {formErrors.status && <div className="invalid-feedback d-block">{formErrors.status}</div>}
              <div className="form-text">
                Inactive users cannot sign in, and are signed out on their next request.
              </div>
            </div>

            <div className="mt-4 d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                {isEdit ? 'Save changes' : 'Create user'}
              </button>
              <a href="/users" className="btn btn-outline-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </Main>
  );
}
