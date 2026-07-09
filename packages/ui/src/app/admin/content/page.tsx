"use client";

import { FileText, Mail, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/context/ToastContext";
import {
  useAdminAttachmentsQuery,
  useTriggerLifecycleEmailsMutation,
  useUploadAdminAttachmentMutation,
} from "@/lib/server-state/adminContent";

export default function AdminContentPage() {
  const { toast } = useToast();
  const attachmentsQuery = useAdminAttachmentsQuery({ limit: 50 });
  const uploadMutation = useUploadAdminAttachmentMutation();
  const lifecycleMutation = useTriggerLifecycleEmailsMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [feature, setFeature] = useState("admin_upload");

  const attachments = attachmentsQuery.data?.data ?? [];

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("feature", feature);
    try {
      await uploadMutation.mutateAsync(formData);
      toast({ message: "File uploaded", type: "success" });
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Upload failed", type: "error" });
    }
  }

  async function triggerLifecycle() {
    try {
      const result = await lifecycleMutation.mutateAsync();
      toast({ message: `Lifecycle batch: ${result.results.sent} sent`, type: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Batch failed", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Content tools
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          File attachments and lifecycle email batch triggers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Lifecycle emails
          </CardTitle>
          <CardDescription>
            Manually trigger the lifecycle email batch (trial reminders, dunning, win-back).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void triggerLifecycle()} disabled={lifecycleMutation.isPending}>
            {lifecycleMutation.isPending ? "Running…" : "Run lifecycle batch"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Upload attachment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="feature">Feature tag</Label>
              <Input
                id="feature"
                value={feature}
                onChange={(e) => setFeature(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <Input id="file" type="file" ref={fileRef} />
            </div>
            <Button type="submit" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Attachments
            </CardTitle>
            <CardDescription>Recently uploaded files across features.</CardDescription>
          </div>
          <ServerStateStatus query={attachmentsQuery} />
        </CardHeader>
        <CardContent>
          {attachmentsQuery.error ? (
            <ErrorState
              message={attachmentsQuery.error.message}
              retry={() => attachmentsQuery.refetch()}
            />
          ) : attachmentsQuery.isPending ? (
            <SkeletonList count={4} />
          ) : attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.fileName}</TableCell>
                    <TableCell className="text-muted-foreground">{a.feature}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {Math.round(a.fileSize / 1024)} KB
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
