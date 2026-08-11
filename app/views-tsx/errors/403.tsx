import ErrorPage from './ErrorPage';

export default function Forbidden() {
  return <ErrorPage code={403} message="You don't have permission to view this page." />;
}
