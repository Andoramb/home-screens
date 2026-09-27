'use client';

import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The button's words: "Sign in with Google" in the editor's language. */
  label: string;
  /** `sm` fits the module settings panel; `md` is Google's standard 40px button. */
  size?: 'sm' | 'md';
}

/**
 * Google's own "Sign in with Google" button, drawn to Google's branding
 * rules rather than the editor's button styles: the standard four-colour G,
 * a pill shape, Roboto Medium, and Google's own colours, dark on the dark
 * editor and white on the light one (the --hs-gsi-* tokens in globals.css).
 * Google checks this button in its app review, so don't restyle it to match
 * the rest of the editor.
 */
export default function GoogleSignInButton({ label, size = 'md', className, style, ...props }: Props) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center gap-2.5 border pl-3 pr-3 whitespace-nowrap',
        'hover:[background-image:linear-gradient(var(--hs-gsi-hover),var(--hs-gsi-hover))]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-9 rounded-[18px] text-[13px]' : 'h-10 rounded-[20px] text-sm leading-5',
        className,
      )}
      style={{
        background: 'var(--hs-gsi-bg)',
        borderColor: 'var(--hs-gsi-border)',
        color: 'var(--hs-gsi-text)',
        fontFamily: "'Google Sans', var(--font-roboto), system-ui, sans-serif",
        fontWeight: 500,
        ...style,
      }}
      {...props}
    >
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full"
        style={{ background: 'var(--hs-gsi-logo-bg)' }}
      >
        <GoogleG />
      </span>
      {label}
    </button>
  );
}

/** Google's standard "G", unchanged: their rules forbid recolouring it. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-3.5 w-3.5 [[data-theme=light]_&]:h-[18px] [[data-theme=light]_&]:w-[18px]">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
