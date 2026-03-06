import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { LocaleProvider } from './contexts/LocaleContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LocaleProvider>
          <FavoritesProvider>
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </FavoritesProvider>
        </LocaleProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
