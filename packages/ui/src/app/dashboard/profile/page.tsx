"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { brand } from "@/config/brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ displayName: "", avatarUrl: "", phone: "", username: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<any>("/auth/me")
      .then((u) => {
        setUser(u);
        setForm({
          displayName: u.displayName || "",
          avatarUrl: u.avatarUrl || "",
          phone: u.phone || "",
          username: u.username || "",
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const updated = await api.patch<any>("/auth/me", {
        displayName: form.displayName || undefined,
        avatarUrl: form.avatarUrl || null,
        phone: form.phone || null,
        username: form.username || null,
      });
      setUser({ ...user, ...updated });
      setMsg("Profile updated successfully.");
      setMsgType("success");
    } catch (err: any) {
      setMsg(err.message || "Update failed");
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMsg("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("za_token") : null;
      const fd = new FormData();
      fd.append("avatar", file);

      const res = await fetch(`${brand.apiUrl}/auth/me/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Upload failed (${res.status})`);
      }

      const { avatarUrl } = await res.json();
      setForm((f) => ({ ...f, avatarUrl }));
      setUser((u: any) => ({ ...u, avatarUrl }));
      setMsg("Avatar updated.");
      setMsgType("success");
    } catch (err: any) {
      setMsg(err.message || "Upload failed");
      setMsgType("error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
      <h1 className="mb-6 text-2xl font-bold text-foreground">Profile Settings</h1>

      {/* Avatar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <Avatar className="h-20 w-20 border-2 border-border">
              {form.avatarUrl ? (
                <AvatarImage src={form.avatarUrl} alt="Avatar" />
              ) : null}
              <AvatarFallback className="bg-primary text-2xl font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="mb-3 text-sm text-muted-foreground">
                Upload a JPEG, PNG, GIF, or WebP image (max 5 MB).
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Choose file"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal info */}
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
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </form>
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
