"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/States";
import {
  useAuthMeQuery,
  useDisableTotpMutation,
  usePatchAuthMeMutation,
  useUploadAvatarMutation,
} from "@/lib/server-state/auth";

export default function ProfilePage() {
  const userQuery = useAuthMeQuery();
  const patchMutation = usePatchAuthMeMutation();
  const uploadMutation = useUploadAvatarMutation();
  const disableTotpMutation = useDisableTotpMutation();

  const user = userQuery.data;
  const [form, setForm] = useState({
    displayName: "",
    avatarUrl: "",
    phone: "",
    username: "",
  });
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: user.displayName || "",
      avatarUrl: user.avatarUrl || "",
      phone: user.phone || "",
      username: user.username || "",
    });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      await patchMutation.mutateAsync({
        displayName: form.displayName || undefined,
        avatarUrl: form.avatarUrl || null,
        phone: form.phone || null,
        username: form.username || null,
      });
      setMsg("Profile updated successfully.");
      setMsgType("success");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Update failed");
      setMsgType("error");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg("");
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const { avatarUrl } = await uploadMutation.mutateAsync(fd);
      setForm((f) => ({ ...f, avatarUrl }));
      setMsg("Avatar updated.");
      setMsgType("success");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
      setMsgType("error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const disableTOTP = async () => {
    if (
      !confirm(
        "Disable two-factor authentication? Your account will be protected by password only."
      )
    )
      return;
    setMsg("");
    try {
      await disableTotpMutation.mutateAsync();
      setMsg("Two-factor authentication disabled.");
      setMsgType("success");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to disable two-factor authentication");
      setMsgType("error");
    }
  };

  if (userQuery.error && !user) {
    return (
      <ErrorState
        message={userQuery.error.message || "Failed to load profile"}
        retry={() => void userQuery.refetch()}
      />
    );
  }

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w: string) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-foreground">
        Profile Settings
      </h1>

      <ServerStateStatus
        isFetching={userQuery.isFetching}
        isStale={userQuery.isStale}
        hasData={Boolean(user)}
        label="profile"
        onRefresh={() => void userQuery.refetch()}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            {form.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAvatarPreviewOpen(true)}
                className="h-20 w-20 shrink-0 rounded-full p-0"
                aria-label="View profile photo"
              >
                <Avatar className="h-20 w-20 cursor-pointer border-2 border-border">
                  <AvatarImage src={form.avatarUrl} alt="Profile photo, click to enlarge" />
                  <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            ) : (
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-sm text-muted-foreground">
                Upload a JPEG, PNG, GIF, or WebP image (max 5 MB).
              </p>
              <Input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadMutation.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {uploadMutation.isPending ? "Uploading…" : "Choose file"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={avatarPreviewOpen} onOpenChange={setAvatarPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
            <DialogDescription className="sr-only">
              Enlarged view of your profile photo. Press Escape to close.
            </DialogDescription>
          </DialogHeader>
          {form.avatarUrl ? (
            // biome-ignore lint/performance/noImgElement: user avatar URL from any host; next/image needs known domains
            <img
              src={form.avatarUrl}
              alt={`Profile avatar of ${user?.displayName || "user"}`}
              className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Personal Info</CardTitle>
        </CardHeader>
        <CardContent>
          {msg && (
            <Alert variant={msgType === "error" ? "destructive" : "default"} className="mb-4">
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="lowercase, hyphens, underscores"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 000 0000"
              />
            </div>
            <Button type="submit" disabled={patchMutation.isPending}>
              {patchMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle>Two-Factor Authentication</CardTitle>
            <Badge variant={user?.mfa?.totp?.enabled ? "success" : "secondary"}>
              {user?.mfa?.totp?.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {user?.mfa?.totp?.enabled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                An authenticator app is required at login.
                {typeof user?.mfa?.totp?.backupCodesRemaining === "number" && (
                  <> {user.mfa.totp.backupCodesRemaining} backup code(s) remaining.</>
                )}
              </p>
              <Button
                variant="destructive"
                onClick={disableTOTP}
                disabled={disableTotpMutation.isPending}
              >
                Disable two-factor authentication
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Add an authenticator app for an extra layer of security at login.
              </p>
              <Button asChild variant="outline">
                <Link href="/dashboard/security">Set up in Security settings</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently delete your account. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={() =>
              confirm("Are you absolutely sure?") &&
              alert("Contact an administrator to delete your account.")
            }
          >
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
