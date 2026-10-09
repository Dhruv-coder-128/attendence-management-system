import React, { useState } from 'react';
import { GraduationCap, Shield, Lock, Mail, ArrowRight, CheckCircle2, AlertCircle, UserPlus, LogIn } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Enterprise Admin Login Screen with Real Supabase Auth
 */
export default function LoginPage({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Please check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.');
      return;
    }

    if (!email || !password) {
      setErrorMessage('Please provide both institutional email and password.');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Register new administrator account in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || 'Administrator',
              role: 'Administrator',
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          // Auto signed in (if email confirmation disabled in Supabase)
          setSuccessMessage('Admin account created! Entering ERP console...');
          if (onLoginSuccess) onLoginSuccess(data.user);
        } else {
          // Email confirmation required by Supabase project settings
          setSuccessMessage('Account created! If email confirmation is enabled on your Supabase project, please verify your email or log in directly.');
          setIsSignUp(false);
        }
      } else {
        // Real Sign In with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          if (onLoginSuccess) onLoginSuccess(data.user);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      // Map standard Supabase error messages to friendly enterprise messages
      if (err.message?.includes('Invalid login credentials')) {
        setErrorMessage('Invalid login credentials. Please verify your email and password, or create an account if you have not registered yet.');
      } else if (err.message?.includes('Email not confirmed')) {
        setErrorMessage('Email address has not been confirmed yet. Please check your inbox or disable email confirmation in Supabase Dashboard -> Auth -> Providers.');
      } else {
        setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--navy-950)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        {/* Institutional Crest & Navy Top Banner */}
        <div
          style={{
            backgroundColor: 'var(--navy-900)',
            padding: '28px 24px 20px',
            textAlign: 'center',
            borderBottom: '2px solid var(--gold-primary)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              backgroundColor: 'var(--navy-800)',
              border: '1px solid var(--gold-border)',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold-primary)',
              marginBottom: '12px',
            }}
          >
            <GraduationCap size={28} />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '18px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Ruparel Attendance ERP
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--gold-light)', marginTop: '4px' }}>
            Administrative Console &bull; Supabase Authentication
          </p>
        </div>

        {/* Tab switch between Sign In and Sign Up */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '13px',
              fontWeight: !isSignUp ? 600 : 500,
              color: !isSignUp ? 'var(--navy-950)' : 'var(--text-muted)',
              backgroundColor: !isSignUp ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: !isSignUp ? '2px solid var(--gold-primary)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <LogIn size={14} /> Admin Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '13px',
              fontWeight: isSignUp ? 600 : 500,
              color: isSignUp ? 'var(--navy-950)' : 'var(--text-muted)',
              backgroundColor: isSignUp ? '#ffffff' : 'transparent',
              border: 'none',
              borderBottom: isSignUp ? '2px solid var(--gold-primary)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <UserPlus size={14} /> Register Admin
          </button>
        </div>

        {/* Login Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {/* Error Banner */}
          {errorMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: 'var(--status-absent)',
                fontSize: '12px',
              }}
            >
              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-present-bg)',
                border: '1px solid var(--status-present-border)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: 'var(--status-present)',
                fontSize: '12px',
              }}
            >
              <CheckCircle2 size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>{successMessage}</div>
            </div>
          )}

          {isSignUp && (
            <Input
              label="Administrator Full Name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Prof. R. Ramanathan"
              required={isSignUp}
            />
          )}

          <Input
            label="Institutional Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@ruparel.edu"
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            helperText={isSignUp ? 'Must be at least 6 characters long' : ''}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading}
            className="w-full"
            style={{ width: '100%', marginTop: '10px' }}
            icon={ArrowRight}
            iconPosition="right"
          >
            {isLoading
              ? isSignUp
                ? 'Creating Account...'
                : 'Verifying with Supabase...'
              : isSignUp
              ? 'Create Administrator Account'
              : 'Sign In to Console'}
          </Button>

          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '3px' }}>
              Authentication Security Notice:
            </div>
            <div>
              Protected by Supabase Auth with Row Level Security. Only authenticated administrative users can access the student registry and attendance records.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
