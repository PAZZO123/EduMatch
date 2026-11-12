/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// MOCK ROLE-BASED AUTHENTICATION — replace with secure backend authentication and authorization before production.

import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ShieldAlert, Loader2, ShieldCheck, X, Cpu, GraduationCap, School, Check } from 'lucide-react';
import { authService, DEMO_ACCOUNTS } from '../services/auth';
import logoImg from '../assets/logo.png';

import './auth.css';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  onBackToLanding: () => void;
  initialMode?: 'login' | 'signup';
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  onBackToLanding,
  initialMode = 'login'
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'Placement Officer' | 'School Administrator'>('Placement Officer');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDemoKey, setSelectedDemoKey] = useState<string | null>(null);

  // Forgot Password Modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter your email address and password.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.login(email, password);

      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Invalid email or password.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Sign-Up Submit
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your password.');
      return;
    }

    // Role safety verification: Never allow Super Admin in public signup
    if (role !== 'Placement Officer' && role !== 'School Administrator') {
      setErrorMessage('Unauthorized role selected.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authService.register({
        name: fullName,
        email,
        password,
        role
      });

      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Registration could not be completed.');
      }
    } catch {
      setErrorMessage('An error occurred during account creation.');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fill demo account helper
  const handleSelectDemoAccount = (key: string) => {
    const acc = DEMO_ACCOUNTS[key];
    if (acc) {
      setEmail(acc.email);
      setPassword(acc.password);
      setSelectedDemoKey(key);
      setErrorMessage(null);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSuccess(true);
  };

  const [animationPaused, setAnimationPaused] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (forgotModalOpen) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [forgotModalOpen]);

  return (
    <div className="auth-page">
<main className="auth-layout">
        <aside className="auth-story" aria-labelledby="auth-story-title">
          <span className="auth-eyebrow">O’Level school placement</span>
          <h2 id="auth-story-title">Better placements<br />begin here.</h2>
          <p>Bring student potential and school opportunity together, with a little help from AI.</p>
          <div className={`auth-illustration${animationPaused ? ' is-paused' : ''}`} aria-hidden="true">
            <div className="auth-orbit auth-orbit-outer" /><div className="auth-orbit auth-orbit-inner" />
            <div className="auth-ai"><Cpu size={38} strokeWidth={1.4} /><span>EduMatch AI</span></div>
            <span className="auth-node auth-node-student"><GraduationCap size={25} /></span>
            <span className="auth-node auth-node-school"><School size={24} /></span>
            <span className="auth-node auth-node-check"><Check size={21} /></span>
            <span className="auth-orbit-dot" />
          </div>
          <button type="button" className="auth-motion-toggle" onClick={() => setAnimationPaused(!animationPaused)} aria-pressed={animationPaused}>{animationPaused ? 'Play animation' : 'Pause animation'}</button>
          <div className="auth-story-note"><ShieldCheck size={19} /><span>AI-assisted. Human-approved.</span></div>
        </aside>
        <section className="auth-form-panel" aria-labelledby="auth-title">
          <div className="auth-form-wrap">
            <button className="auth-brand auth-form-brand" onClick={onBackToLanding} aria-label="EduMatch AI home"><img src={logoImg} alt="" /><span>EduMatch <em>AI</em></span></button>
            <div className="auth-form-heading"><span className="auth-eyebrow">Welcome to EduMatch</span><h1 id="auth-title">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h1><p>{mode === 'login' ? 'Enter your details to access your workspace.' : 'Set up your account to get started.'}</p></div>
            {errorMessage && <div className="auth-error" role="alert"><ShieldAlert size={18} /><span>{errorMessage}</span></div>}
            <form onSubmit={mode === 'login' ? handleLoginSubmit : handleSignUpSubmit} className="auth-form" aria-busy={isLoading}>
              {mode === 'signup' && <div className="auth-field"><label htmlFor="auth-name">Full name</label><input id="auth-name" name="name" autoComplete="name" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" disabled={isLoading} /></div>}
              <div className="auth-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={e => { setEmail(e.target.value); setSelectedDemoKey(null); }} placeholder="you@example.com" disabled={isLoading} /></div>
              {mode === 'signup' && <div className="auth-field"><label htmlFor="auth-role">Account role</label><select id="auth-role" value={role} onChange={e => setRole(e.target.value as typeof role)} disabled={isLoading}><option value="Placement Officer">Placement Officer</option><option value="School Administrator">School Administrator</option></select><p className="auth-field-hint">Administrator accounts are managed by your organization.</p></div>}
              <div className="auth-field"><div className="auth-label-row"><label htmlFor="auth-password">Password</label>{mode === 'login' && <button type="button" className="auth-link" onClick={() => { setForgotEmail(email); setForgotSuccess(false); setForgotModalOpen(true); }}>Forgot password?</button>}</div><div className="auth-password"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => { setPassword(e.target.value); setSelectedDemoKey(null); }} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} disabled={isLoading} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              {mode === 'signup' && <div className="auth-field"><label htmlFor="auth-confirm">Confirm password</label><div className="auth-password"><input id="auth-confirm" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" disabled={isLoading} /><button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>}
              <button type="submit" className="auth-submit" disabled={isLoading}>{isLoading && <Loader2 size={18} className="animate-spin" />}{isLoading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}</button>
            </form>
            <p className="auth-switch">{mode === 'login' ? 'New to EduMatch?' : 'Already have an account?'} <button className="auth-link" disabled={isLoading} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrorMessage(null); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
            {mode === 'login' && <details className="auth-demo"><summary>Try a demo account <span>Optional</span></summary><p>Select a role to fill in the demo credentials.</p><div className="auth-demo-grid">{([['superadmin', 'Super Admin'], ['placement', 'Placement Admin'], ['school', 'School Admin'], ['officer', 'Placement Officer']] as const).map(([key, label]) => <button type="button" key={key} disabled={isLoading} aria-pressed={selectedDemoKey === key} onClick={() => handleSelectDemoAccount(key)}>{label}{selectedDemoKey === key && <Check size={14} />}</button>)}</div></details>}
          </div>
        </section>
      </main>
<dialog ref={resetDialog} className="auth-reset" onCancel={() => setForgotModalOpen(false)} aria-labelledby="reset-title">
        <div className="auth-reset-heading"><h2 id="reset-title">Reset your password</h2><button aria-label="Close password reset" onClick={() => setForgotModalOpen(false)}><X size={20} /></button></div>
        {forgotSuccess ? <><p role="status" className="auth-reset-status">This prototype has recorded your request for <strong>{forgotEmail}</strong>. No recovery email has been sent.</p><button className="auth-submit" onClick={() => setForgotModalOpen(false)}>Done</button></> : <form onSubmit={handleForgotSubmit} className="auth-form"><p className="auth-field-hint">Enter the email address associated with your account. Password recovery is simulated in this prototype.</p><div className="auth-field"><label htmlFor="reset-email">Email address</label><input id="reset-email" autoFocus type="email" autoComplete="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@example.com" /></div><button type="submit" className="auth-submit">Request password reset</button></form>}
      </dialog>
    </div>
  );
};
