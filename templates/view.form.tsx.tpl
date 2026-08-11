import Main from '../layouts/Main';
import type { BaseViewProps, FormErrors } from '../types';

type Props = BaseViewProps & {
  record: Record<string, any>;
  formErrors: FormErrors;
};

export default function __Name__Form({ record = {}, formErrors = {}, ...layout }: Props) {
  const isEdit = Boolean(record.id);
  return (
    <Main {...layout} title={layout.title}>
      <h4 className="mb-3">{layout.title}</h4>
      <div className="card">
        <div className="card-body">
          <form method="POST" action={isEdit ? `/__kebab__/${record.id}` : '/__kebab__'} noValidate>
            <input type="hidden" name="_csrf" value={layout.csrfToken} />
            {isEdit && <input type="hidden" name="_method" value="PUT" />}

            {/* Add your fields here, e.g.:
            <div className="mb-3">
              <label className="form-label">Name *</label>
              <input
                type="text"
                name="name"
                className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                defaultValue={record.name || ''}
                required
              />
              {formErrors.name && <div className="invalid-feedback d-block">{formErrors.name}</div>}
            </div>
            */}

            <div className="mt-4 d-flex gap-2">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <a href="/__kebab__" className="btn btn-outline-secondary">
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </Main>
  );
}
