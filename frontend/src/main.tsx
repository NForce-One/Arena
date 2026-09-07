import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { PendingCountsProvider } from './auth/PendingCountsContext';
import { UnreadProvider } from './auth/UnreadContext';
import './index.css';
import './styles/dashboard.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {}
        <UnreadProvider>
          <PendingCountsProvider>
            <App />
          </PendingCountsProvider>
        </UnreadProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
