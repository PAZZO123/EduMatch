/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// MOCK ROLE-BASED AUTHENTICATION — replace with secure backend authentication and authorization before production.

import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldAlert,
  Loader2,
  ChevronLeft,
  KeyRound,
  CheckCircle2,
  Shield,
  HelpCircle,
  X
} from 'lucide-react';
import { authService, DEMO_ACCOUNTS } from '../services/auth';

// Authentic Rwandan secondary education photography
import heroRwandaStudents from '../assets/images/hero_rwanda_students_1790766556338.jpg';
import learningRwandaGroup from '../assets/images/learning_rwanda_group_1790766616806.jpg';

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
      setErrorMessage('Please enter both your administrator email and password.');
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

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
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

  return (
    <div className="min-h-screen bg-white grid grid-cols-1 md:grid-cols-2 selection:bg-[#2563EB] selection:text-white">
      {/* ============================================================== */}
      {/* 1. LEFT SIDE: EXACTLY EQUAL 50% SPLIT IMAGE COLUMN */}
      {/* ============================================================== */}
      <div className="relative w-full h-72 md:h-full min-h-full overflow-hidden bg-[#0B1F3A] flex flex-col justify-between p-6 sm:p-10 order-1 md:order-1">
        {/* Full-Cover Background Photograph */}
        <img
          src={mode === 'login' ? heroRwandaStudents : learningRwandaGroup}
          alt={
            mode === 'login'
              ? 'Rwandan secondary school students walking in school uniforms'
              : 'Rwandan students collaborating in study hall'
          }
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          referrerPolicy="no-referrer"
        />

        {/* Subtle Dark Navy Scrim Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/40 to-[#0B1F3A]/20" />

        {/* Top-Left Back Link */}
        <div className="relative z-20">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to site</span>
          </button>
        </div>

        {/* Bottom-Left Overlay Content */}
        <div className="relative z-20 text-white space-y-2 max-w-lg hidden sm:block">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-mono uppercase tracking-wider text-[#99F6E4] font-semibold">
            {mode === 'login' ? 'National O-Level Placement' : 'Institutional Pathway Allocation'}
          </div>

          <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-tight">
            {mode === 'login' ? (
              <>
                Smarter Placement.<br />
                <span className="text-[#99F6E4]">Better Opportunities.</span>
              </>
            ) : (
              <>
                Build better pathways<br />
                <span className="text-[#99F6E4]">for students.</span>
              </>
            )}
          </h2>

          <p className="text-xs text-slate-200 leading-relaxed max-w-sm">
            {mode === 'login'
              ? 'AI-assisted student-school matching for Rwanda.'
              : 'EduMatch AI brings intelligent recommendations and human decision-making together.'}
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2 & 3. RIGHT SIDE: EXACTLY EQUAL 50% SPLIT FORM COLUMN */}
      {/* ============================================================== */}
      <div className="w-full h-full min-h-full flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 overflow-y-auto bg-white order-2 md:order-2">
        <div className="max-w-md w-full mx-auto space-y-6">
          {/* Logo & Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[6px] bg-[#2563EB] flex items-center justify-center text-white font-bold text-sm shadow-xs ring-1 ring-black/5">
                <span className="font-mono tracking-tighter">E·</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#0B1F3A] font-extrabold text-base tracking-tight">
                  EduMatch
                </span>
                <span className="text-[#0F9D8A] font-semibold text-xs px-1.5 py-0.5 rounded-[4px] bg-[#0F9D8A]/10 border border-[#0F9D8A]/30">
                  AI
                </span>
              </div>
            </div>

            <div className="pt-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-xs text-[#64748B] mt-1">
                {mode === 'login'
                  ? 'Sign in to continue to EduMatch AI.'
                  : 'Get started with EduMatch AI.'}
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-[6px] bg-rose-50 border border-rose-200 text-xs text-[#DC2626] font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-[#DC2626]" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ======================= */}
          {/* LOGIN FORM */}
          {/* ======================= */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value);
                      setSelectedDemoKey(null);
                    }}
                    placeholder="name@edumatch.rw"
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#0B1F3A]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotSuccess(false);
                      setForgotModalOpen(true);
                    }}
                    className="text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      setSelectedDemoKey(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B1F3A] transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-xs rounded-[6px] shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {/* Demo Mode Quick Accounts */}
              <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-[6px] text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0B1F3A] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#0F9D8A]" />
                    <span>Demo Accounts</span>
                  </span>
                  <span className="text-[10px] font-mono uppercase bg-[#0F9D8A]/10 text-[#0F9D8A] px-1.5 py-0.2 rounded font-semibold">
                    Demo Mode
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectDemoAccount('superadmin')}
                    className={`p-1.5 rounded-[4px] border text-left transition-colors cursor-pointer ${
                      selectedDemoKey === 'superadmin'
                        ? 'bg-blue-50 border-[#2563EB] text-[#2563EB] font-bold'
                        : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold leading-tight">Super Admin</div>
                    <div className="text-[9px] text-[#64748B] font-mono truncate">superadmin@edumatch.rw</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDemoAccount('placement')}
                    className={`p-1.5 rounded-[4px] border text-left transition-colors cursor-pointer ${
                      selectedDemoKey === 'placement'
                        ? 'bg-blue-50 border-[#2563EB] text-[#2563EB] font-bold'
                        : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold leading-tight">Placement Admin</div>
                    <div className="text-[9px] text-[#64748B] font-mono truncate">placement@edumatch.rw</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDemoAccount('school')}
                    className={`p-1.5 rounded-[4px] border text-left transition-colors cursor-pointer ${
                      selectedDemoKey === 'school'
                        ? 'bg-blue-50 border-[#2563EB] text-[#2563EB] font-bold'
                        : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold leading-tight">School Admin</div>
                    <div className="text-[9px] text-[#64748B] font-mono truncate">school@edumatch.rw</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectDemoAccount('officer')}
                    className={`p-1.5 rounded-[4px] border text-left transition-colors cursor-pointer ${
                      selectedDemoKey === 'officer'
                        ? 'bg-blue-50 border-[#2563EB] text-[#2563EB] font-bold'
                        : 'bg-white border-[#E2E8F0] text-[#0F172A] hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-[11px] font-semibold leading-tight">Placement Officer</div>
                    <div className="text-[9px] text-[#64748B] font-mono truncate">officer@edumatch.rw</div>
                  </button>
                </div>
              </div>

              {/* Switch to Sign Up */}
              <div className="pt-2 text-center text-xs text-[#64748B]">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                  }}
                  className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Create account
                </button>
              </div>
            </form>
          )}

          {/* ======================= */}
          {/* SIGN-UP FORM */}
          {/* ======================= */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Emmanuel Habumugisha"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="e.habumugisha@edumatch.rw"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              {/* Role Dropdown (Placement Officer or School Admin only) */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Account Role
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as 'Placement Officer' | 'School Administrator')}
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                >
                  <option value="Placement Officer">Placement Officer (Evaluates candidates & proposals)</option>
                  <option value="School Administrator">School Administrator (Manages school quotas & rosters)</option>
                </select>
                <span className="text-[10px] text-[#64748B]">
                  * Super Administrator accounts can only be provisioned by NESA governance.
                </span>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-9 pr-10 py-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B1F3A] transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#0B1F3A]">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-9 pr-10 py-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs text-[#0F172A] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B1F3A] transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-xs rounded-[6px] shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {/* Switch to Sign In */}
              <div className="pt-2 text-center text-xs text-[#64748B]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                  }}
                  className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </div>
            </form>
          )}

          {/* Institutional Note */}
          <div className="pt-4 text-center border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
            EduMatch AI · NESA O-Level Placement Infrastructure
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-sm w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-sm text-[#0B1F3A]">Password Reset</h3>
              <button
                onClick={() => setForgotModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-[#16A34A] rounded-[6px]">
                  Password reset link sent to <strong>{forgotEmail}</strong>. (Simulated for this prototype session).
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setForgotModalOpen(false)}
                    className="px-4 py-1.5 bg-[#0B1F3A] text-white rounded-[6px] font-semibold text-xs"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <p className="text-[#64748B] leading-relaxed">
                  Enter your administrative email address to receive a secure recovery code.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="admin@edumatch.rw"
                    className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs text-[#64748B] hover:text-[#0B1F3A]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-[6px]"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
