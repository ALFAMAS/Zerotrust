"use client";

import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/context/ToastContext";
import {
  type SearchIndexType,
  useDeleteIndexedDocumentMutation,
  useIndexDocumentMutation,
  useSearchProviderQuery,
} from "@/lib/server-state/adminSearch";

export default function AdminSearchPage() {
  const { toast } = useToast();
  const providerQuery = useSearchProviderQuery();
  const indexMutation = useIndexDocumentMutation();
  const deleteMutation = useDeleteIndexedDocumentMutation();
  const [form, setForm] = useState({
    id: "",
    type: "user" as SearchIndexType,
    orgId: "",
    title: "",
    content: "",
  });
  const [deleteForm, setDeleteForm] = useState({ type: "user" as SearchIndexType, id: "" });

  async function handleIndex(e: React.FormEvent) {
    e.preventDefault();
    try {
      await indexMutation.mutateAsync({
        id: form.id.trim(),
        type: form.type,
        orgId: form.orgId.trim(),
        title: form.title.trim(),
        content: form.content.trim() || undefined,
      });
      toast({ message: "Document indexed", type: "success" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Index failed", type: "error" });
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    try {
      await deleteMutation.mutateAsync({ type: deleteForm.type, id: deleteForm.id.trim() });
      toast({ message: "Document removed from index", type: "success" });
      setDeleteForm({ type: deleteForm.type, id: "" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Delete failed", type: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Search className="h-6 w-6 text-primary" />
        <div>
          <PageHeader
            title={<>Search index</>}
            description={<>Manage the full-text search index (Postgres FTS or Elasticsearch).</>}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Active provider</CardTitle>
            <CardDescription>Backend used for search queries.</CardDescription>
          </div>
          <ServerStateStatus query={providerQuery} />
        </CardHeader>
        <CardContent>
          <Badge variant="outline">{providerQuery.data?.provider ?? "loading…"}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Index document</CardTitle>
          <CardDescription>POST /search/index — upsert a searchable document.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleIndex} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="docId">Document ID</Label>
              <Input
                id="docId"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="docType">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as SearchIndexType }))}
              >
                <SelectTrigger id="docType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="org">org</SelectItem>
                  <SelectItem value="ticket">ticket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="orgId">Org ID</Label>
              <Input
                id="orgId"
                value={form.orgId}
                onChange={(e) => setForm((f) => ({ ...f, orgId: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="content">Content (optional)</Label>
              <Input
                id="content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={indexMutation.isPending}>
                {indexMutation.isPending ? "Indexing…" : "Index document"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Remove from index
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleDelete} className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="delType">Type</Label>
              <Select
                value={deleteForm.type}
                onValueChange={(v) => setDeleteForm((f) => ({ ...f, type: v as SearchIndexType }))}
              >
                <SelectTrigger id="delType" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="org">org</SelectItem>
                  <SelectItem value="ticket">ticket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delId">Document ID</Label>
              <Input
                id="delId"
                value={deleteForm.id}
                onChange={(e) => setDeleteForm((f) => ({ ...f, id: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" variant="destructive" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
