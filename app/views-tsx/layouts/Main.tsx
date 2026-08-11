// The TSX equivalent of views/layouts/main.ejs. In TSX a layout is just a component that takes
// `children` — there's no framework layout mechanism to learn, and no `<%- body %>` indirection.
import type { ReactNode } from 'react';

export type FlashMessages = {
  success?: string[];
  error?: string[];
  info?: string[];
};

export type LayoutProps = {
  title: string;
  appName?: string;
  currentUser?: { id: number | string; username: string; status: string } | null;
  csrfToken?: string;
  messages?: FlashMessages;
  children?: ReactNode;
};

const ALERT_CLASS: Record<string, string> = {
  success: 'success',
  error: 'danger',
  info: 'info',
};

export default function Main({ title, appName = 'Forge MVC', currentUser, csrfToken, messages = {}, children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · ${appName}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" />
        <link rel="stylesheet" href="/css/app.css" />
      </head>
      <body>
        <nav className="navbar navbar-expand navbar-dark bg-dark px-3">
          <a className="navbar-brand" href="/">
            <i className="bi bi-hammer me-1" />
            {appName}
          </a>
          <div className="ms-auto d-flex align-items-center gap-3">
            {currentUser && (
              <>
                <span className="text-light small">{currentUser.username}</span>
                <form action="/logout" method="POST" className="mb-0">
                  <input type="hidden" name="_csrf" value={csrfToken} />
                  <button className="btn btn-sm btn-outline-light" type="submit">
                    Logout
                  </button>
                </form>
              </>
            )}
          </div>
        </nav>

        <main className="container py-4">
          {(['success', 'error', 'info'] as const).flatMap((kind) =>
            (messages[kind] || []).map((msg, i) => (
              <div key={`${kind}-${i}`} className={`alert alert-${ALERT_CLASS[kind]} alert-dismissible fade show`} role="alert">
                {msg}
                <button type="button" className="btn-close" data-bs-dismiss="alert" />
              </div>
            ))
          )}
          {children}
        </main>

        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" />
        {/* Server-rendered React can't ship inline event handlers, so destructive forms declare
            data-confirm="..." and this delegated listener turns it into a confirm() prompt. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('submit',function(e){var m=e.target.getAttribute&&e.target.getAttribute('data-confirm');if(m&&!confirm(m))e.preventDefault();});`,
          }}
        />
      </body>
    </html>
  );
}
