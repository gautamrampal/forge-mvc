// Shared prop types for the TSX views. This is the payoff of the TSX engine over EJS: the shape
// a controller passes to res.render() is checked by TypeScript instead of failing at runtime
// with "cannot read property of undefined" halfway down a template.
import type { FlashMessages } from './layouts/Main';

// Mirrors the users table minus `password` — User.publicFields() strips the hash before any
// record reaches a view, and the type makes that guarantee visible.
export type User = {
  id: number | string;
  username: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
};

// Every view gets these from core/middlewares/sharedLocals.js + the CSRF middleware.
export type BaseViewProps = {
  title: string;
  appName?: string;
  messages?: FlashMessages;
  currentUser?: User | null;
  currentPath?: string;
  csrfToken?: string;
};

// What Model.paginate() returns, spread into the view's props.
export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Field name -> error message, as flashed by core/middlewares/validate.js.
export type FormErrors = Record<string, string>;
