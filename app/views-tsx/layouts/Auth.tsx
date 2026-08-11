import type { ReactNode } from 'react';
import type { FlashMessages } from './Main';

const ALERT_CLASS: Record<string, string> = { success: 'success', error: 'danger', info: 'info' };

export type AuthLayoutProps = {
  title: string;
  appName?: string;
  messages?: FlashMessages;
  children?: ReactNode;
};

export default function Auth({ title, appName = 'Forge MVC', messages = {}, children }: AuthLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · ${appName}`}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
        <link rel="stylesheet" href="/css/app.css" />
      </head>
      <body className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: '#0f172a' }}>
        <div className="w-100" style={{ maxWidth: 400 }}>
          <h4 className="text-center text-white mb-3">{appName}</h4>
          <div className="card border-0 shadow-lg">
            <div className="card-body p-4">
              <h5 className="mb-3">{title}</h5>
              {(['success', 'error', 'info'] as const).flatMap((kind) =>
                (messages[kind] || []).map((msg, i) => (
                  <div key={`${kind}-${i}`} className={`alert alert-${ALERT_CLASS[kind]}`}>
                    {msg}
                  </div>
                ))
              )}
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
