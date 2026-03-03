/**
 * Login Page - Google Sign-In only
 */

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { loginWithGoogle, error: authError, clearError } = useAuth();

  const handleGoogleLogin = async () => {
    clearError();
    setIsGoogleLoading(true);
    await loginWithGoogle();
    // OAuth redirects the browser — reset loading after timeout in case of failure
    setTimeout(() => setIsGoogleLoading(false), 5000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-xs">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl text-white font-bold">M</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Welcome to Mindline</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">WhatsApp & Gmail AI Assistant</p>
        </div>

        {/* Error */}
        {authError && (
          <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {authError}
          </div>
        )}

        {/* Google Sign-In Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="w-full py-3 px-4 bg-white dark:bg-gray-800 border border-[var(--border-color)] rounded-lg font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-3 transition-colors shadow-sm"
        >
          {isGoogleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span>{isGoogleLoading ? 'Connecting…' : 'Continue with Google'}</span>
        </button>

        <p className="text-center text-xs text-[var(--text-muted)] mt-6">
          By continuing, you agree to connect your Google account to Mindline.
        </p>
      </div>
    </div>
  );
}
