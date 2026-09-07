import { createContext, useContext, useState, type ReactNode } from 'react';

interface SearchQueryValue {
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
}

const SearchQueryContext = createContext<SearchQueryValue | null>(null);

export function SearchQueryProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const clear = () => setQuery('');
  return (
    <SearchQueryContext.Provider value={{ query, setQuery, clear }}>
      {children}
    </SearchQueryContext.Provider>
  );
}

export function useSearchQuery(): SearchQueryValue {
  const ctx = useContext(SearchQueryContext);
  if (!ctx) throw new Error('useSearchQuery must be used inside SearchQueryProvider');
  return ctx;
}
