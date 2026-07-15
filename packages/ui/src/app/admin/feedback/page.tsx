"use client";

import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminFeedbackQuery } from "@/lib/server-state/adminFeedback";

const FEEDBACK_TYPES = ["", "nps", "csat", "thumbs"] as const;

export default function AdminFeedbackPage() {
  const [type, setType] = useState<string>("");
  const feedbackQuery = useAdminFeedbackQuery({ type: type || undefined, limit: 50 });
  const entries = feedbackQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div>
          <PageHeader
            title={<>Feedback inbox</>}
            description={<>NPS, CSAT, and thumbs-up/down responses from the in-app widget.</>}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>
              {feedbackQuery.data?.pagination?.total ?? 0} total responses
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FEEDBACK_TYPES.filter(Boolean).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ServerStateStatus query={feedbackQuery} />
          </div>
        </CardHeader>
        <CardContent>
          {feedbackQuery.error ? (
            <ErrorState
              message={feedbackQuery.error.message}
              retry={() => feedbackQuery.refetch()}
            />
          ) : feedbackQuery.isPending ? (
            <SkeletonList count={5} />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="outline">{entry.type}</Badge>
                    </TableCell>
                    <TableCell>{entry.score ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{entry.comment ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.context ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
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
