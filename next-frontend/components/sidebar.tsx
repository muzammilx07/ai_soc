"use client";

import { ArrowLeft, LogOut, Settings, Shield, UserCog } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from "@/components/ui";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/live-events", label: "Live Events" },
  { href: "/alerts", label: "Alerts" },
  { href: "/incidents", label: "Incidents" },
  { href: "/log-tools", label: "Log Tools" },
  { href: "/system-status", label: "System Status" },
  { href: "/cases", label: "Cases" },
  { href: "/playbooks", label: "Playbooks" },
  { href: "/threat-report", label: "Threat Report" },
  { href: "/ml-analytics", label: "ML Analytics" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data } = useSession();
  const [showProfile, setShowProfile] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [eventMaxLimitEnabled, setEventMaxLimitEnabled] = useState(true);
  const [eventMaxLimitCount, setEventMaxLimitCount] = useState(300);
  const [eventMaxLimitInput, setEventMaxLimitInput] = useState("300");
  const [profileMessage, setProfileMessage] = useState("");
  const settingsHydratedRef = useRef(false);

  const sessionName = data?.user?.name || "SOC Analyst";
  const [displayName, setDisplayName] = useState(sessionName);
  const displayEmail = data?.user?.email || "analyst@ai-soc.local";
  const displayImage = data?.user?.image || "";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (settingsHydratedRef.current) {
      return;
    }
    settingsHydratedRef.current = true;

    const savedName = window.localStorage.getItem("soc.profile.displayName");
    if (savedName && savedName.trim()) {
      setDisplayName(savedName.trim());
      setProfileNameInput(savedName.trim());
    } else {
      setDisplayName(sessionName);
      setProfileNameInput(sessionName);
    }

    const savedLimitEnabled =
      window.localStorage.getItem("soc.live.max.enabled") ?? window.localStorage.getItem("soc.live.rate.enabled");
    const savedLimitCount =
      window.localStorage.getItem("soc.live.max.count") ?? window.localStorage.getItem("soc.live.rate.limitPerMin");

    setEventMaxLimitEnabled(savedLimitEnabled !== "false");
    if (savedLimitCount) {
      const parsed = Number(savedLimitCount);
      if (Number.isFinite(parsed) && parsed > 0) {
        const normalized = Math.floor(parsed);
        setEventMaxLimitCount(normalized);
        setEventMaxLimitInput(String(normalized));
      }
    } else {
      setEventMaxLimitInput(String(eventMaxLimitCount));
    }
  }, [eventMaxLimitCount, sessionName]);

  const handleLogout = async () => {
    setShowProfile(false);
    await signOut({ callbackUrl: "/signin" });
  };

  const saveProfileName = () => {
    const cleaned = profileNameInput.trim();
    if (!cleaned) {
      setProfileMessage("Profile name cannot be empty.");
      return;
    }

    window.localStorage.setItem("soc.profile.displayName", cleaned);
    setDisplayName(cleaned);
    setProfileMessage("Profile name updated.");
  };

  const saveRateLimitSettings = () => {
    const normalizedLimit = Math.max(20, Math.min(5000, Math.floor(Number(eventMaxLimitInput) || 300)));
    window.localStorage.setItem("soc.live.max.enabled", String(eventMaxLimitEnabled));
    window.localStorage.setItem("soc.live.max.count", String(normalizedLimit));
    setEventMaxLimitCount(normalizedLimit);
    setEventMaxLimitInput(String(normalizedLimit));
    window.dispatchEvent(new Event("soc-live-settings-updated"));
    setProfileMessage("Max events settings saved.");
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-border bg-card/60 px-4 py-5 backdrop-blur xl:flex xl:flex-col">
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
        <div className="rounded-md bg-primary/15 p-2 text-primary">
          <Shield size={18} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Platform</p>
          <p className="text-sm font-semibold text-foreground">AI SOC</p>
        </div>
      </div>

      <nav className="space-y-1 overflow-y-auto pr-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname.startsWith(link.href)
                ? "block rounded-md border border-border bg-primary/10 px-3 py-2 text-sm font-medium text-foreground"
                : "block rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-lg border border-border bg-background p-3">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="flex min-w-0 items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted/60"
          >
            {displayImage ? (
              <img
                src={displayImage}
                alt="User avatar"
                className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                {avatarLetter}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowProfile(true)}>
              <Settings size={14} className="mr-1" />
              Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowProfile(true)}>
              <UserCog size={14} className="mr-1" />
              Account
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-w-md">
          <div className="space-y-1">
            <DialogTitle>Profile & Preferences</DialogTitle>
            <DialogDescription>Manage your SOC account actions</DialogDescription>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/35 p-3">
            {displayImage ? (
              <img
                src={displayImage}
                alt="User avatar"
                className="h-12 w-12 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                {avatarLetter}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => {
                setShowProfile(false);
                setShowEditProfile(true);
              }}
              className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <span>My Profile</span>
              <UserCog size={14} className="text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowProfile(false);
                setShowSecurity(true);
              }}
              className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <span>Security Settings</span>
              <Settings size={14} className="text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
            >
              <span>Logout</span>
              <LogOut size={14} className="text-destructive" />
            </button>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowProfile(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditProfile} onOpenChange={setShowEditProfile}>
        <DialogContent className="max-w-md">
          <div className="mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowEditProfile(false);
                setShowProfile(true);
              }}
            >
              <ArrowLeft size={14} className="mr-1" />
              Back
            </Button>
          </div>
          <div className="space-y-1">
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your display name</DialogDescription>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Profile Name</p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={profileNameInput}
                onChange={(event) => setProfileNameInput(event.target.value)}
                placeholder="Enter profile name"
              />
              <Button size="sm" onClick={saveProfileName}>Save</Button>
            </div>
          </div>

          {profileMessage ? <p className="mt-2 text-xs text-muted-foreground">{profileMessage}</p> : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEditProfile(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSecurity} onOpenChange={setShowSecurity}>
        <DialogContent className="max-w-md">
          <div className="mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSecurity(false);
                setShowProfile(true);
              }}
            >
              <ArrowLeft size={14} className="mr-1" />
              Back
            </Button>
          </div>
          <div className="space-y-1">
            <DialogTitle>Security Settings</DialogTitle>
            <DialogDescription>Manage live event max limit</DialogDescription>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Max Events Limit</p>
            <p className="mt-1 text-xs text-muted-foreground">Stop live updates when total events reaches this value.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={eventMaxLimitEnabled}
                  onChange={(event) => setEventMaxLimitEnabled(event.target.checked)}
                />
                Enable
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Max events</span>
                <Input
                  type="number"
                  min={20}
                  max={5000}
                  disabled={!eventMaxLimitEnabled}
                  value={eventMaxLimitInput}
                  onChange={(event) => setEventMaxLimitInput(event.target.value)}
                  className="w-24"
                />
              </div>
              <Button size="sm" variant="outline" onClick={saveRateLimitSettings}>Apply</Button>
            </div>
          </div>

          {profileMessage ? <p className="mt-2 text-xs text-muted-foreground">{profileMessage}</p> : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSecurity(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
