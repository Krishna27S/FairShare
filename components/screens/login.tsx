'use client';

import { useState } from 'react';
import { signIn, signUp, isValidEmail } from '@/lib/auth-utils';
import { useApp } from '@/lib/app-context';
import { ArrowRight } from 'lucide-react';

export function LoginScreen() {
  const { setScreen } = useApp();
  const [isSignUp, setIsSignUp] = useState(false);
  const [userRole, setUserRole] = useState<'individual' | 'organisation'>('individual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);

  // Show inline email error only during sign-up after the field has been touched
  const showEmailError = isSignUp && emailTouched && email.length > 0 && !isValidEmail(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Extra guard: block submission if email is invalid during sign-up
    if (isSignUp && !isValidEmail(email)) {
      setError('Invalid email address. Please enter a valid email (e.g. name@example.com).');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName, userRole);
      } else {
        await signIn(email, password);
      }
      setScreen('dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="bg-primary rounded-2xl w-24 h-24 flex items-center justify-center">
            <span className="text-4xl font-bold text-primary-foreground">F</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-center text-foreground mb-2">FairShare</h1>
        <p className="text-center text-muted-foreground mb-8">
          Split expenses, not friendships
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Account Type</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setUserRole('individual')}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition ${
                      userRole === 'individual'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground border border-border'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRole('organisation')}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition ${
                      userRole === 'organisation'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground border border-border'
                    }`}
                  >
                    Organisation
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required={isSignUp}
                  className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="student@university.com"
              required
              className={`w-full px-4 py-3 rounded-lg bg-secondary border focus:outline-none focus:ring-2 text-foreground transition ${
                showEmailError
                  ? 'border-destructive focus:ring-destructive'
                  : 'border-border focus:ring-primary'
              }`}
            />
            {showEmailError && (
              <p className="text-destructive text-xs mt-1">
                Please enter a valid email address (e.g. name@example.com)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
              className="w-full px-4 py-3 rounded-lg bg-secondary border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || (isSignUp && emailTouched && !isValidEmail(email))}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isSignUp ? 'Sign up' : 'Sign in'} <ArrowRight size={20} />
          </button>
        </form>

        {/* Toggle Sign Up/In */}
        <p className="text-center text-muted-foreground">
          {isSignUp ? 'Already have an account? ' : "New here? "}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setEmailTouched(false);
            }}
            className="text-primary hover:underline font-medium"
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  );
}
