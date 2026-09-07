import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole } from './auth/RequireRole';
import { rolesRequiredFor } from './auth/routeAccess';
import { CricketLoader } from './components/CricketLoader';
import { DashboardShell } from './components/dashboard/layout/DashboardShell';
import { DashboardAdminAnnouncementsPage } from './components/dashboard/pages/AdminAnnouncementsPage';
import { DashboardAdminAuditPage } from './components/dashboard/pages/AdminAuditPage';
import { DashboardAdminChildAccountsPage } from './components/dashboard/pages/AdminChildAccountsPage';
import { DashboardAdminUsersPage } from './components/dashboard/pages/AdminUsersPage';
import {
  DashboardChildCricketProfilePage,
  DashboardCricketProfilePage,
} from './components/dashboard/pages/CricketProfilePage';
import { DashboardFixturesLayout } from './components/dashboard/pages/FixturesLayout';
import { DashboardFixturesResultsPage } from './components/dashboard/pages/FixturesResultsPage';
import { DashboardFixturesUpcomingPage } from './components/dashboard/pages/FixturesUpcomingPage';
import { DashboardGroundDetailPage } from './components/dashboard/pages/GroundDetailPage';
import { DashboardGroundsAddPage } from './components/dashboard/pages/GroundsAddPage';
import { DashboardPlayerHubPage } from './components/dashboard/pages/PlayerHubPage';
import { DashboardGroundsBookingsPage } from './components/dashboard/pages/GroundsBookingsPage';
import { DashboardGroundsLayout } from './components/dashboard/pages/GroundsLayout';
import { DashboardGroundsListPage } from './components/dashboard/pages/GroundsListPage';
import { DashboardNotFoundPage } from './components/dashboard/pages/NotFoundPage';
import { DashboardNotificationsPage } from './components/dashboard/pages/NotificationsPage';
import { DashboardOrganizerBookingsBrowsePage } from './components/dashboard/pages/OrganizerBookingsBrowsePage';
import { DashboardOrganizerBookingsPage } from './components/dashboard/pages/OrganizerBookingsPage';
import { DashboardOrganizerTournamentDetailsPage } from './components/dashboard/pages/OrganizerTournamentDetailsPage';
import { DashboardOrganizerTournamentEditPage } from './components/dashboard/pages/OrganizerTournamentEditPage';
import { DashboardOrganizerTournamentFixturesPage } from './components/dashboard/pages/OrganizerTournamentFixturesPage';
import { DashboardOrganizerTournamentLayout } from './components/dashboard/pages/OrganizerTournamentLayout';
import { DashboardOrganizerTournamentRegistrationsPage } from './components/dashboard/pages/OrganizerTournamentRegistrationsPage';
import { DashboardOrganizerTournamentScheduleMatchPage } from './components/dashboard/pages/OrganizerTournamentScheduleMatchPage';
import { DashboardOrganizerTournamentsNewPage } from './components/dashboard/pages/OrganizerTournamentsNewPage';
import { DashboardOrganizerTournamentsPage } from './components/dashboard/pages/OrganizerTournamentsPage';
import { DashboardMyTournamentsPage } from './components/dashboard/pages/MyTournamentsPage';
import { DashboardParentAddChildPage } from './components/dashboard/pages/ParentAddChildPage';
import { DashboardParentChildDetailLayout } from './components/dashboard/pages/ParentChildDetailLayout';
import { DashboardParentChildFixturesLayout } from './components/dashboard/pages/ParentChildFixturesLayout';
import { DashboardParentChildFixturesPastPage } from './components/dashboard/pages/ParentChildFixturesPastPage';
import { DashboardParentChildFixturesUpcomingPage } from './components/dashboard/pages/ParentChildFixturesUpcomingPage';
import { DashboardParentChildInvitationsPage } from './components/dashboard/pages/ParentChildInvitationsPage';
import { DashboardParentChildRegistrationsPage } from './components/dashboard/pages/ParentChildRegistrationsPage';
import { DashboardParentPage } from './components/dashboard/pages/ParentPage';
import { DashboardPlayerProfilePage } from './components/dashboard/pages/PlayerProfilePage';
import { DashboardProfileAlertsPage } from './components/dashboard/pages/ProfileAlertsPage';
import { DashboardProfilePage } from './components/dashboard/pages/ProfilePage';
import { DashboardAdminContactPage } from './components/dashboard/pages/AdminContactPage';
import { DashboardContactPage } from './components/dashboard/pages/ContactPage';
import { DashboardRequestRolePage } from './components/dashboard/pages/RequestRolePage';
import { DashboardTeamDetailLayout } from './components/dashboard/pages/TeamDetailLayout';
import { DashboardTeamSquadPage } from './components/dashboard/pages/TeamSquadPage';
import { DashboardTeamTournamentRequestsPage } from './components/dashboard/pages/TeamTournamentRequestsPage';
import { DashboardTeamsPage } from './components/dashboard/pages/TeamsPage';
import { DashboardTournamentDetailPage } from './components/dashboard/pages/TournamentDetailPage';
import { DashboardTournamentsPage } from './components/dashboard/pages/TournamentsPage';
import { DashboardUmpireApplicationsPage } from './components/dashboard/pages/UmpireApplicationsPage';
import { DashboardUmpireInvitesPage } from './components/dashboard/pages/UmpireInvitesPage';
import { DashboardUmpireLayout } from './components/dashboard/pages/UmpireLayout';
import { DashboardUmpireOpenMatchesPage } from './components/dashboard/pages/UmpireOpenMatchesPage';
import {
  DashboardUmpireSchedulePage,
  DashboardUmpireSchedulePastPage,
} from './components/dashboard/pages/UmpireSchedulePage';
import { ClaimAccountPage } from './pages/ClaimAccountPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LandingPage } from './pages/LandingPage';
import { CareersPage } from './pages/landing/CareersPage';
import { CookiesPage } from './pages/landing/CookiesPage';
import { PrivacyPage } from './pages/landing/PrivacyPage';
import { TermsPage } from './pages/landing/TermsPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SignUpPage } from './pages/SignUpPage';
import { ConfirmEmailChangePage } from './pages/ConfirmEmailChangePage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

function RouteLoading() {
  return (
    <div className="page-loading">
      <CricketLoader label="Loading…" size="block" />
    </div>
  );
}

export function App() {
  const { status } = useAuth();

  return (
    <div className="app">
      <main className="content-bleed">
        <Routes>
          {}
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/tournaments"
            element={
              status === 'loading' ? (
                <RouteLoading />
              ) : (
                <DashboardShell>
                  <DashboardTournamentsPage />
                </DashboardShell>
              )
            }
          />
          <Route
            path="/tournaments/:id"
            element={
              status === 'loading' ? (
                <RouteLoading />
              ) : (
                <DashboardShell>
                  <DashboardTournamentDetailPage />
                </DashboardShell>
              )
            }
          />
          <Route
            path="/tournaments/mine"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/tournaments/mine') ?? []}>
                  <DashboardShell>
                    <DashboardMyTournamentsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/players/:id"
            element={
              status === 'loading' ? (
                <RouteLoading />
              ) : (
                <DashboardShell>
                  <DashboardPlayerProfilePage />
                </DashboardShell>
              )
            }
          />

          {}
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />

          {}
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/claim-account" element={<ClaimAccountPage />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />

          {}
          {}
          <Route path="/dashboard" element={<Navigate to="/tournaments" replace />} />
          <Route
            path="/fixtures"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardFixturesLayout />
                </DashboardShell>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardFixturesUpcomingPage />} />
            <Route path="results" element={<DashboardFixturesResultsPage />} />
          </Route>
          <Route
            path="/player"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardPlayerHubPage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardNotificationsPage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardProfilePage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/profile/cricket"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardCricketProfilePage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/profile/alerts"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardProfileAlertsPage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/request-role"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardRequestRolePage />
                </DashboardShell>
              </RequireAuth>
            }
          />
          <Route
            path="/contact"
            element={
              <RequireAuth>
                <DashboardShell>
                  <DashboardContactPage />
                </DashboardShell>
              </RequireAuth>
            }
          />

          {}
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/admin/users') ?? []}>
                  <DashboardShell>
                    <DashboardAdminUsersPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/announcements"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/admin/announcements') ?? []}>
                  <DashboardShell>
                    <DashboardAdminAnnouncementsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/contact-messages"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/admin/contact-messages') ?? []}>
                  <DashboardShell>
                    <DashboardAdminContactPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/child-accounts"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/admin/child-accounts') ?? []}>
                  <DashboardShell>
                    <DashboardAdminChildAccountsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/admin/audit') ?? []}>
                  <DashboardShell>
                    <DashboardAdminAuditPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/tournaments"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/tournaments') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerTournamentsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/tournaments/new"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/tournaments') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerTournamentsNewPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/tournaments/:id"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/tournaments') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerTournamentLayout />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardOrganizerTournamentDetailsPage />} />
            <Route
              path="registrations"
              element={<DashboardOrganizerTournamentRegistrationsPage />}
            />
            <Route path="fixtures" element={<DashboardOrganizerTournamentFixturesPage />} />
            <Route
              path="schedule-match"
              element={<DashboardOrganizerTournamentScheduleMatchPage />}
            />
          </Route>
          <Route
            path="/organizer/tournaments/:id/edit"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/tournaments') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerTournamentEditPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/bookings"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/bookings') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerBookingsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/bookings/browse"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/organizer/bookings') ?? []}>
                  <DashboardShell>
                    <DashboardOrganizerBookingsBrowsePage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="/teams"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/teams') ?? []}>
                  <DashboardShell>
                    <DashboardTeamsPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/teams/:id"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/teams') ?? []}>
                  <DashboardShell>
                    <DashboardTeamDetailLayout />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardTeamSquadPage />} />
            <Route path="tournament-requests" element={<DashboardTeamTournamentRequestsPage />} />
          </Route>
          <Route
            path="/grounds"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/grounds') ?? []}>
                  <DashboardShell>
                    <DashboardGroundsLayout />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardGroundsListPage />} />
            <Route path="new" element={<DashboardGroundsAddPage />} />
            <Route path="bookings" element={<DashboardGroundsBookingsPage />} />
          </Route>
          <Route
            path="/grounds/:id"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/grounds') ?? []}>
                  <DashboardShell>
                    <DashboardGroundDetailPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/umpire"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/umpire') ?? []}>
                  <DashboardShell>
                    <DashboardUmpireLayout />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardUmpireSchedulePage />} />
            <Route path="past" element={<DashboardUmpireSchedulePastPage />} />
            <Route path="invites" element={<DashboardUmpireInvitesPage />} />
            <Route path="open-matches" element={<DashboardUmpireOpenMatchesPage />} />
            <Route path="applications" element={<DashboardUmpireApplicationsPage />} />
          </Route>
          <Route
            path="/parent"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/parent') ?? []}>
                  <DashboardShell>
                    <DashboardParentPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/children/:id"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/parent') ?? []}>
                  <DashboardShell>
                    <DashboardParentChildDetailLayout />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardParentChildInvitationsPage />} />
            <Route path="registrations" element={<DashboardParentChildRegistrationsPage />} />
            <Route path="fixtures" element={<DashboardParentChildFixturesLayout />}>
              <Route index element={<DashboardParentChildFixturesUpcomingPage />} />
              <Route path="past" element={<DashboardParentChildFixturesPastPage />} />
            </Route>
          </Route>
          <Route
            path="/parent/children/new"
            element={
              <RequireAuth>
                <RequireRole roles={rolesRequiredFor('/parent/children/new') ?? []}>
                  <DashboardShell>
                    <DashboardParentAddChildPage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/parent/children/:childId/cricket-profile"
            element={
              <RequireAuth>
                <RequireRole
                  roles={rolesRequiredFor('/parent/children/:childId/cricket-profile') ?? []}
                >
                  <DashboardShell>
                    <DashboardChildCricketProfilePage />
                  </DashboardShell>
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route
            path="*"
            element={
              status === 'loading' ? (
                <RouteLoading />
              ) : (
                <DashboardShell>
                  <DashboardNotFoundPage />
                </DashboardShell>
              )
            }
          />
        </Routes>
      </main>
    </div>
  );
}
