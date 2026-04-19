'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginFormValues) {
    setAuthError(null);
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });
      if (result?.error) {
        setAuthError('Invalid email or password.');
      } else {
        router.push('/');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    setIsLoading(true);
    try {
      await signIn('google', { callbackUrl: '/' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
      style={{ backgroundColor: '#171717', border: '1px solid #262626' }}
    >
      {/* Logo / Title */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold" style={{ color: '#fafafa' }}>
          Byte<span style={{ color: '#22c55e' }}>Finance</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#a1a1aa' }}>
          Sign in to your account
        </p>
      </div>

      {/* Google Sign-In */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: '#262626',
          color: '#fafafa',
          border: '1px solid #404040',
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ backgroundColor: '#262626' }} />
        <span className="text-xs" style={{ color: '#a1a1aa' }}>
          or
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: '#262626' }} />
      </div>

      {/* Email / Password Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: '#fafafa' }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: '#0a0a0a',
              border: `1px solid ${errors.email ? '#ef4444' : '#262626'}`,
              color: '#fafafa',
            }}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: '#fafafa' }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              backgroundColor: '#0a0a0a',
              border: `1px solid ${errors.password ? '#ef4444' : '#262626'}`,
              color: '#fafafa',
            }}
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {errors.password.message}
            </p>
          )}
        </div>

        {authError && (
          <p className="text-sm text-center" style={{ color: '#ef4444' }}>
            {authError}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#22c55e', color: '#0a0a0a' }}
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
