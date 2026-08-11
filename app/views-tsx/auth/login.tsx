import Auth from '../layouts/Auth';
import type { BaseViewProps, FormErrors } from '../types';

type Props = BaseViewProps & {
  notice?: string | null;
  formErrors: FormErrors;
  formData: Record<string, string>;
};

export default function Login({ notice, formErrors = {}, formData = {}, ...layout }: Props) {
  return (
    <Auth {...layout}>
      {notice && <div className="alert alert-warning">{notice}</div>}

      <form method="POST" action="/login" noValidate>
        <input type="hidden" name="_csrf" value={layout.csrfToken} />

        <div className="mb-3">
          <label className="form-label" htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            className={`form-control ${formErrors.username ? 'is-invalid' : ''}`}
            defaultValue={formData.username || ''}
            required
            autoFocus
            autoComplete="username"
          />
          {formErrors.username && <div className="invalid-feedback d-block">{formErrors.username}</div>}
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            className={`form-control ${formErrors.password ? 'is-invalid' : ''}`}
            required
            autoComplete="current-password"
          />
          {formErrors.password && <div className="invalid-feedback d-block">{formErrors.password}</div>}
        </div>

        <button type="submit" className="btn btn-primary w-100">Sign in</button>
      </form>

      <hr />
      <p className="small text-muted mb-0">
        Demo account: <code>admin</code> / <code>Admin@12345</code>
      </p>
    </Auth>
  );
}
