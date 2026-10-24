"use client";

import { useState, type FormEvent } from "react";
import { useClerk, useAuthRequest, useCurrentUser } from "./AuthProvider";
import { useReadingProfile } from "@/lib/useReadingProfile";
import { downloadJson } from "@/lib/download-json";
import { supabase } from "@/lib/supabase";
import SiteHeader from "./SiteHeader";
import ProfileAccess from "./ProfileAccess";
import ProfileSyncNotice from "./ProfileSyncNotice";
import Link from "./PageLink";
import {
  ShieldCheck,
  Mail,
  KeyRound,
  Download,
  AlertTriangle,
  LogOut,
  Check,
  BookOpenCheck,
  Bookmark,
  Building2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  EyeOff,
  Sparkles,
  Database,
  Lock,
} from "lucide-react";

export default function AccountSettings() {
  const request = useAuthRequest();
  const clerk = useClerk();
  const user = useCurrentUser();
  const reading = useReadingProfile();

  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteIdentity, setDeleteIdentity] = useState(false);

  // In-line password management
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const download = async () => {
    setBusy("download");
    setMessage("");
    try {
      const response = await request("/api/account");
      if (!response.ok) throw new Error("Your reading data could not be downloaded. Try again.");
      const value = (await response.json()) as Record<string, unknown>;
      downloadJson("readwell-reading-data.json", {
        ...value,
        deviceCopy: reading.profile,
        unsyncedCopy: reading.recovery,
      });
      setMessage("Your export includes the account data and your current device copy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    setBusy("delete");
    setMessage("");
    try {
      const response = await request("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { error?: string };
        throw new Error(problem.error || "Your data could not be deleted. Try again.");
      }
      if (reading.profileOwner) {
        const key = `scroll:reading-profile:v1:${encodeURIComponent(reading.profileOwner)}`;
        try {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}:unsynced`);
        } catch {
          /* Server deletion succeeded. */
        }
      }
      try {
        await clerk.signOut({ redirectUrl: "/" });
      } catch {
        window.location.replace("/");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deletion failed.");
      setBusy("");
    }
  };

  const handlePasswordUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordStatus({ type: "error", text: "Password must be at least 6 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", text: "Passwords do not match." });
      return;
    }
    setPasswordBusy(true);
    setPasswordStatus(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setPasswordStatus({ type: "success", text: "Your password has been successfully updated." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordStatus({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update password. Try again.",
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const provider =
    (user?.app_metadata?.provider as string | undefined) ||
    (user?.identities?.[0]?.provider as string | undefined) ||
    "email";

  const displayName =
    reading.profile.name ||
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split('@')[0] ||
    "Reader";

  const providerLabel =
    provider === "google" ? "Google Account" : provider === "github" ? "GitHub Account" : "Email & Password";

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="publication">
      <a className="skip-link" href="#account-settings">
        Skip to reading data
      </a>
      <SiteHeader active="profile" />

      <main id="account-settings" className="reading-main settings-main">
        <ProfileAccess>
          <header className="settings-header">
            <div className="issue-pill">
              <span></span>Account &amp; Security
            </div>
            <h1>
              Manage sign-in &amp; <em>reading data</em>
            </h1>
            <p className="settings-subtitle">
              Your credentials and reading belong to you. Update your security, inspect what is stored, or download your data.
            </p>
          </header>

          <ProfileSyncNotice {...reading} />

          {/* Section 1: Sign-in & Security */}
          <section className="settings-section-card" aria-labelledby="section-security-title">
            <div className="settings-card-header">
              <ShieldCheck size={22} aria-hidden="true" />
              <h2 id="section-security-title">Sign-in &amp; credentials</h2>
            </div>
            <p className="settings-card-desc">
              Your authenticated identity, active session, and credentials used to sign in to Readwell.
            </p>

            <div className="account-identity-box">
              <div className="account-user-info">
                <div className="account-avatar" aria-hidden="true">
                  {displayName[0].toUpperCase()}
                </div>
                <div className="account-details">
                  <p className="account-name">{displayName}</p>
                  <p className="account-email">{user?.email || "Signed-in Reader"}</p>
                  <div className="account-meta">
                    <span className="account-badge is-verified">
                      <Check size={11} aria-hidden="true" /> Verified
                    </span>
                    <span className="account-badge">
                      <Mail size={11} aria-hidden="true" /> {providerLabel}
                    </span>
                    {memberSince && <span className="account-date">Joined {memberSince}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Password Update Accordion */}
            <div className="settings-password-section">
              <button
                type="button"
                className="text-button settings-accordion-toggle"
                onClick={() => {
                  setShowPasswordForm((v) => !v);
                  setPasswordStatus(null);
                }}
                aria-expanded={showPasswordForm}
              >
                <KeyRound size={14} aria-hidden="true" />
                <span>
                  {showPasswordForm
                    ? "Hide password change"
                    : provider === "google"
                    ? "Set account password"
                    : "Change password"}
                </span>
                {showPasswordForm ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>

              {showPasswordForm && (
                <div className="settings-password-box">
                  {provider === "google" && (
                    <p className="settings-password-hint">
                      Setting a password lets you sign in using either Google or your email address anytime.
                    </p>
                  )}
                  <form onSubmit={handlePasswordUpdate} className="settings-password-form">
                    {passwordStatus && (
                      <div
                        className={passwordStatus.type === "success" ? "supabase-success" : "supabase-error"}
                        role="alert"
                      >
                        {passwordStatus.text}
                      </div>
                    )}
                    <div className="supabase-field">
                      <label htmlFor="new-password">New password</label>
                      <input
                        id="new-password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        className="supabase-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={passwordBusy}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="supabase-field">
                      <label htmlFor="confirm-password">Confirm new password</label>
                      <input
                        id="confirm-password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        className="supabase-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={passwordBusy}
                        autoComplete="new-password"
                      />
                    </div>
                    <button type="submit" className="ink-button" disabled={passwordBusy}>
                      {passwordBusy && <LoaderCircle size={14} className="auth-spinner" aria-hidden="true" />}
                      <span>{passwordBusy ? "Updating password…" : "Save new password"}</span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            <div className="account-security-actions">
              <button
                type="button"
                className="ink-button signout-btn"
                onClick={() => clerk.signOut({ redirectUrl: "/" })}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Sign out of this device</span>
              </button>
            </div>
          </section>

          {/* Section 2: Library & Privacy Overview */}
          <section className="settings-section-card" aria-labelledby="section-storage-title">
            <div className="settings-card-header">
              <Database size={22} aria-hidden="true" />
              <h2 id="section-storage-title">What Readwell stores</h2>
            </div>
            <p className="settings-card-desc">
              Your reading profile stores your bookmarks, logs, and follows. Everything else stays with original publishers.
            </p>

            {/* Real Library Metrics */}
            <div className="library-stats-grid">
              <div className="library-stat-card">
                <div className="stat-icon-wrap"><Bookmark size={16} aria-hidden="true" /></div>
                <div className="stat-number">{reading.profile.bookmarks.length}</div>
                <div className="stat-label">Bookmarks</div>
                <div className="stat-cap">Limit 4,000</div>
              </div>
              <div className="library-stat-card">
                <div className="stat-icon-wrap"><BookOpenCheck size={16} aria-hidden="true" /></div>
                <div className="stat-number">{reading.profile.readLogs.length}</div>
                <div className="stat-label">Read logs</div>
                <div className="stat-cap">Limit 2,000</div>
              </div>
              <div className="library-stat-card">
                <div className="stat-icon-wrap"><Building2 size={16} aria-hidden="true" /></div>
                <div className="stat-number">{reading.profile.follows.length}</div>
                <div className="stat-label">Following</div>
                <div className="stat-cap">Companies</div>
              </div>
              <div className="library-stat-card">
                <div className="stat-icon-wrap"><SlidersHorizontal size={16} aria-hidden="true" /></div>
                <div className="stat-number">{reading.profile.customFeeds.length}</div>
                <div className="stat-label">Custom feeds</div>
                <div className="stat-cap">Limit 30</div>
              </div>
            </div>

            {/* Clear Policy Breakdown */}
            <div className="policy-card-list">
              <div className="policy-card-item">
                <EyeOff size={18} aria-hidden="true" />
                <p>
                  <strong>Private reading library:</strong> Other readers never see your personal reading list or followed companies. Your bookmarks and read logs only contribute anonymized popularity counts to Trending.
                </p>
              </div>
              <div className="policy-card-item">
                <Sparkles size={18} aria-hidden="true" />
                <p>
                  <strong>Zero profile scraping:</strong> Recommendation rankings use public publisher metadata (titles and excerpts). Your private account profile is never transmitted to third-party embedding services.
                </p>
              </div>
              <div className="policy-card-item">
                <Lock size={18} aria-hidden="true" />
                <p>
                  <strong>Device backups:</strong> Safe local copies are preserved in this browser so you can recover interrupted saves even across connection drops. Activity dots are retained in UTC for up to 400 days.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: Data Export */}
          <section className="settings-section-card" aria-labelledby="section-export-title">
            <div className="settings-card-header">
              <Download size={22} aria-hidden="true" />
              <h2 id="section-export-title">Download your reading data</h2>
            </div>
            <p className="settings-card-desc">
              Download a complete JSON export of your account profile, reading logs, bookmarks, and local device state.
            </p>
            <button
              type="button"
              className="ink-button"
              disabled={!!busy || !reading.accountVerified}
              onClick={download}
            >
              <Download size={14} aria-hidden="true" />
              <span>{busy === "download" ? "Preparing download…" : "Download reading data (JSON)"}</span>
            </button>
          </section>

          {/* Section 4: Danger Zone */}
          <section className="settings-section-card settings-danger-card" aria-labelledby="section-danger-title">
            <div className="settings-card-header danger-header">
              <AlertTriangle size={22} aria-hidden="true" />
              <h2 id="section-danger-title">Delete your reading data</h2>
            </div>
            <p className="settings-card-desc">
              Permanently removes your profile, follows, custom feeds, bookmarks, read logs, and contributions to public counts. This cannot be undone. Download a copy first if you want to keep it.
            </p>

            <label className="recovery-confirm">
              <input
                type="checkbox"
                checked={deleteIdentity}
                onChange={(event) => {
                  setDeleteIdentity(event.target.checked);
                  setConfirmation("");
                }}
              />
              <span>Also permanently delete my sign-in account.</span>
            </label>

            <label className="settings-confirm">
              <span>Type <strong>{deleteIdentity ? "DELETE MY ACCOUNT" : "DELETE MY READING DATA"}</strong> to confirm:</span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={deleteIdentity ? "DELETE MY ACCOUNT" : "DELETE MY READING DATA"}
              />
            </label>

            <button
              type="button"
              className="ink-button danger-button"
              disabled={
                !!busy ||
                confirmation !== (deleteIdentity ? "DELETE MY ACCOUNT" : "DELETE MY READING DATA") ||
                !reading.accountVerified ||
                reading.syncStatus === "syncing"
              }
              onClick={remove}
            >
              {busy === "delete"
                ? "Deleting reading data…"
                : deleteIdentity
                ? "Delete account permanently"
                : "Delete reading data and sign out"}
            </button>
          </section>

          {message && (
            <p className="sync-notice" role="status">
              {message}
            </p>
          )}

          <footer className="paper-footer">
            <Link href="/profile" className="footer-link">
              ← Back to your reading
            </Link>
            <Link href="/privacy" className="footer-link">
              Privacy details
            </Link>
          </footer>
        </ProfileAccess>
      </main>
    </div>
  );
}
