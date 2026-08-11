import ErrorPage from './ErrorPage';

export default function NotFound() {
  return <ErrorPage code={404} message="The page you're looking for doesn't exist." />;
}
