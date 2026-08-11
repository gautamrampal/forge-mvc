import Main from '../layouts/Main';
import type { BaseViewProps } from '../types';

type Props = BaseViewProps & { record: Record<string, any> };

export default function __Name__Detail({ record, ...layout }: Props) {
  return (
    <Main {...layout} title={layout.title}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">__Name__ #{record.id}</h4>
        <div className="d-flex gap-2">
          <a href={`/__kebab__/${record.id}/edit`} className="btn btn-sm btn-outline-secondary">
            Edit
          </a>
          {/* data-confirm is wired to confirm() by the script in layouts/Main.tsx — server-rendered
              React can't ship inline onSubmit handlers. */}
          <form method="POST" action={`/__kebab__/${record.id}`} data-confirm="Delete this __Name__?">
            <input type="hidden" name="_csrf" value={layout.csrfToken} />
            <input type="hidden" name="_method" value="DELETE" />
            <button className="btn btn-sm btn-outline-danger">Delete</button>
          </form>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <pre className="mb-0">{JSON.stringify(record, null, 2)}</pre>
        </div>
      </div>
    </Main>
  );
}
