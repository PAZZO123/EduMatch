/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// MOCK ROLE-BASED AUTHENTICATION — replace with secure backend authentication and authorization before production.

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardScreen } from './components/DashboardScreen';
import { StudentPlacementScreen } from './components/StudentPlacementScreen';
import { StudentsScreen } from './components/StudentsScreen';
import { SchoolsScreen } from './components/SchoolsScreen';
import { ResponsibleAIScreen } from './components/ResponsibleAIScreen';
import { AcceptanceGate } from './components/AcceptanceGate';
import { UserManagement } from './components/UserManagement';
import { MyAccountScreen } from './components/MyAccountScreen';
import { AccessRestricted } from './components/AccessRestricted';
import { LandingPage } from './components/LandingPage';
import { AdminLogin } from './components/AdminLogin';
import { BackendSettingsModal } from './components/BackendSettingsModal';
import { api } from './services/api';
import { authService, UserAccount } from './services/auth';
import { DashboardMetrics, Offer } from './types';

export default function App() {
  // Routes: 'landing' | 'login' | 'admin'
  const [route, setRoute] = useState<'landing' | 'login' | 'admin'>('landing');
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authService.isAuthenticated());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => authService.getCurrentUser());

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const loadInitialData = async () => {
    try {
      const [sum, offersRes] = await Promise.all([
        api.getCohortSummary(),
        api.getOffers()
      ]);
      setActiveRunId(sum.active_run_id);
      setOffers(offersRes.offers);

      if (sum.active_run_id) {
        const propRes = await api.getProposals(sum.active_run_id);
        setMetrics(propRes.metrics);
      }
    } catch {
      // API warming up
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleRunEngine = async () => {
    setIsRunning(true);
    try {
      const res = await api.runPlacement('AI_ASSISTED');
      setActiveRunId(res.run_id);
      setMetrics(res.metrics);
      const offersRes = await api.getOffers();
      setOffers(offersRes.offers);
      setCurrentView('placement');
    } catch (err: any) {
      console.error('Run failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDrillStudent = (studentId?: string) => {
    setSelectedStudentId(studentId);
    setCurrentView('placement');
  };

  // Auth Flow Handlers
  const handleExplorePlatform = () => {
    if (authService.isAuthenticated()) {
      setIsAuthenticated(true);
      setCurrentUser(authService.getCurrentUser());
      setRoute('admin');
      setCurrentView('dashboard');
    } else {
      setRoute('login');
    }
  };

  const handleSignIn = () => {
    if (authService.isAuthenticated()) {
      setIsAuthenticated(true);
      setCurrentUser(authService.getCurrentUser());
      setRoute('admin');
      setCurrentView('dashboard');
    } else {
      setRoute('login');
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(authService.getCurrentUser());
    setRoute('admin');
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setRoute('login');
  };

  const handleBackToLanding = () => {
    setRoute('landing');
  };

  // Route 1: Landing Page
  if (route === 'landing') {
    return (
      <LandingPage
        onExplorePlatform={handleExplorePlatform}
        onSignIn={handleSignIn}
      />
    );
  }

  // Route 2: Admin Login
  if (route === 'login') {
    return (
      <AdminLogin
        onLoginSuccess={handleLoginSuccess}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  // Route 3: Protected Admin Portal Guard
  if (route === 'admin' && !isAuthenticated) {
    return (
      <AdminLogin
        onLoginSuccess={handleLoginSuccess}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  // Check role permission for the active view
  const userRole = currentUser?.role;
  const isViewPermitted = authService.hasPermission(userRole, currentView);

  const approvedCount = metrics ? metrics.approved_count : 0;
  const pendingCount = metrics ? metrics.assigned_count - metrics.approved_count : 0;

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-[#0F172A] overflow-hidden font-sans antialiased">
      {/* 5. Role-Filtered Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={view => {
          setSelectedStudentId(undefined);
          setCurrentView(view);
        }}
        onOpenLanding={handleBackToLanding}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
        pendingReviewCount={pendingCount}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 2 & 10. Role-Aware Admin Header */}
        <TopHeader
          currentView={currentView}
          onNavigateView={setCurrentView}
          onRunEngine={handleRunEngine}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={handleLogout}
          activeRunId={activeRunId}
          isRunning={isRunning}
          approvedCount={approvedCount}
        />

        {/* 8. Protected View Router with Permission Enforcement */}
        <main className="flex-1 overflow-y-auto bg-[#F8FAFC]">
          {!isViewPermitted ? (
            <AccessRestricted
              currentRole={userRole}
              requestedPage={currentView.toUpperCase()}
              onReturnDashboard={() => setCurrentView('dashboard')}
            />
          ) : (
            <>
              {currentView === 'dashboard' && (
                <DashboardScreen
                  metrics={metrics}
                  offers={offers}
                  onNavigateToPlacement={handleDrillStudent}
                  onNavigateToSchools={() => setCurrentView('schools')}
                  onRunEngine={handleRunEngine}
                />
              )}

              {currentView === 'placement' && (
                <StudentPlacementScreen
                  initialStudentId={selectedStudentId}
                  onRefreshProposals={loadInitialData}
                />
              )}

              {currentView === 'students' && (
                <StudentsScreen
                  onSelectStudent={handleDrillStudent}
                  activeRunId={activeRunId}
                />
              )}

              {currentView === 'schools' && (
                <SchoolsScreen />
              )}

              {currentView === 'responsible_ai' && (
                <ResponsibleAIScreen />
              )}

              {currentView === 'analytics' && (
                <DashboardScreen
                  metrics={metrics}
                  offers={offers}
                  onNavigateToPlacement={handleDrillStudent}
                  onNavigateToSchools={() => setCurrentView('schools')}
                  onRunEngine={handleRunEngine}
                />
              )}

              {currentView === 'users' && (
                <UserManagement />
              )}

              {currentView === 'account' && (
                <MyAccountScreen
                  currentUser={currentUser}
                  onUserUpdated={() => setCurrentUser(authService.getCurrentUser())}
                />
              )}

              {currentView === 'acceptance' && (
                <AcceptanceGate />
              )}
            </>
          )}
        </main>
      </div>

      {/* Backend & API Settings Modal */}
      <BackendSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onBackendChanged={loadInitialData}
      />
    </div>
  );
}
