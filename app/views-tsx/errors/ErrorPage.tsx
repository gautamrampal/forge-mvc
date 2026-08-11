// Shared shell for the standalone error pages (no app chrome, no session assumptions — these
// render even when something upstream has already failed).
export default function ErrorPage({ code, message }: { code: number | string; message: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{String(code)}</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />
      </head>
      <body className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <h1 className="display-4">{code}</h1>
          <p className="text-muted">{message}</p>
          <a href="/" className="btn btn-primary">
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
