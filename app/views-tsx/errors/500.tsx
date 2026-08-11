import ErrorPage from './ErrorPage';

export default function ServerError({ message }: { message?: string }) {
  return <ErrorPage code={500} message={message || 'An unexpected error occurred.'} />;
}
