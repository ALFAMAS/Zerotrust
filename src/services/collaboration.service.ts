import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  sharedNotesTable,
  sharedNoteRevisionsTable,
  activityEventsTable,
  mentionsTable,
  usersTable,
} from "../db/schema";
import { broadcastNotification } from "../api/routes/notification.routes";
import { sendNotificationEmail } from "../services/email.service";

// ── Shared notes ─────────────────────────────────────────────────────────────

export interface CreateNoteInput {
  orgId: string;
  title: string;
  content?: string;
  createdBy: string;
}

export async function createNote(input: CreateNoteInput) {
  const db = getDb();
  const [note] = await db
    .insert(sharedNotesTable)
    .values({
      orgId: input.orgId,
      title: input.title,
      content: input.content ?? "",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();

  // Record revision
  await db.insert(sharedNoteRevisionsTable).values({
    noteId: note.id,
    content: note.content,
    editedBy: input.createdBy,
  });

  // Emit activity event
  await db.insert(activityEventsTable).values({
    orgId: input.orgId,
    userId: input.createdBy,
    type: "note_created",
    title: `Note "${input.title}" created`,
  });

  // Process @mentions in content
  await processMentions({
    orgId: input.orgId,
    sourceId: note.id,
    sourceType: "note",
    content: note.content,
    mentionedByUserId: input.createdBy,
  });

  return note;
}

export async function updateNote(noteId: string, userId: string, updates: { title?: string; content?: string }) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sharedNotesTable)
    .where(eq(sharedNotesTable.id, noteId))
    .limit(1);

  if (!existing) return null;

  const [updated] = await db
    .update(sharedNotesTable)
    .set({
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(sharedNotesTable.id, noteId))
    .returning();

  // Record revision if content changed
  if (updates.content !== undefined) {
    await db.insert(sharedNoteRevisionsTable).values({
      noteId,
      content: updates.content,
      editedBy: userId,
    });

    // Process @mentions
    await processMentions({
      orgId: existing.orgId,
      sourceId: noteId,
      sourceType: "note",
      content: updates.content,
      mentionedByUserId: userId,
    });
  }

  // Emit activity
  await db.insert(activityEventsTable).values({
    orgId: existing.orgId,
    userId,
    type: "note_updated",
    title: `Note "${updated.title}" updated`,
    metadata: { noteId },
  });

  return updated;
}

export async function archiveNote(noteId: string, userId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(sharedNotesTable)
    .where(eq(sharedNotesTable.id, noteId))
    .limit(1);

  if (!existing) return false;

  await db
    .update(sharedNotesTable)
    .set({ archived: true, updatedBy: userId, updatedAt: new Date() })
    .where(eq(sharedNotesTable.id, noteId));

  await db.insert(activityEventsTable).values({
    orgId: existing.orgId,
    userId,
    type: "note_updated",
    title: `Note "${existing.title}" archived`,
    metadata: { noteId, archived: true },
  });

  return true;
}

export async function getNote(noteId: string) {
  const db = getDb();
  const [note] = await db
    .select()
    .from(sharedNotesTable)
    .where(and(eq(sharedNotesTable.id, noteId), eq(sharedNotesTable.archived, false)))
    .limit(1);
  return note ?? null;
}

export async function listNotes(orgId: string, limit = 50, offset = 0) {
  const db = getDb();
  return db
    .select({
      id: sharedNotesTable.id,
      title: sharedNotesTable.title,
      content: sharedNotesTable.content,
      createdBy: sharedNotesTable.createdBy,
      updatedBy: sharedNotesTable.updatedBy,
      createdAt: sharedNotesTable.createdAt,
      updatedAt: sharedNotesTable.updatedAt,
      creatorName: usersTable.displayName,
    })
    .from(sharedNotesTable)
    .leftJoin(usersTable, eq(sharedNotesTable.createdBy, usersTable.id))
    .where(and(eq(sharedNotesTable.orgId, orgId), eq(sharedNotesTable.archived, false)))
    .orderBy(desc(sharedNotesTable.updatedAt))
    .limit(limit)
    .offset(offset);
}

export async function getNoteRevisions(noteId: string, limit = 20) {
  const db = getDb();
  return db
    .select({
      id: sharedNoteRevisionsTable.id,
      content: sharedNoteRevisionsTable.content,
      editedBy: sharedNoteRevisionsTable.editedBy,
      createdAt: sharedNoteRevisionsTable.createdAt,
      editorName: usersTable.displayName,
    })
    .from(sharedNoteRevisionsTable)
    .leftJoin(usersTable, eq(sharedNoteRevisionsTable.editedBy, usersTable.id))
    .where(eq(sharedNoteRevisionsTable.noteId, noteId))
    .orderBy(desc(sharedNoteRevisionsTable.createdAt))
    .limit(limit);
}

// ── Activity feed ────────────────────────────────────────────────────────────

export async function getActivityFeed(orgId: string, limit = 30, offset = 0) {
  const db = getDb();
  return db
    .select({
      id: activityEventsTable.id,
      type: activityEventsTable.type,
      title: activityEventsTable.title,
      description: activityEventsTable.description,
      metadata: activityEventsTable.metadata,
      createdAt: activityEventsTable.createdAt,
      userId: activityEventsTable.userId,
      userName: usersTable.displayName,
    })
    .from(activityEventsTable)
    .leftJoin(usersTable, eq(activityEventsTable.userId, usersTable.id))
    .where(eq(activityEventsTable.orgId, orgId))
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function emitActivityEvent(input: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(activityEventsTable).values(input);
}

// ── @mentions ────────────────────────────────────────────────────────────────

const MENTION_PATTERN = /@([a-zA-Z0-9._-]+)/g;

async function processMentions(input: {
  orgId: string;
  sourceId: string;
  sourceType: string;
  content: string;
  mentionedByUserId: string;
}): Promise<void> {
  const matches = input.content.matchAll(MENTION_PATTERN);
  const usernames = new Set<string>();
  for (const m of matches) usernames.add(m[1]);

  if (usernames.size === 0) return;

  const db = getDb();
  const usernameArray = Array.from(usernames);

  // Resolve usernames to user IDs
  const users = await db
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.username, usernameArray));

  for (const user of users) {
    if (user.id === input.mentionedByUserId) continue;

    await db.insert(mentionsTable).values({
      orgId: input.orgId,
      mentionedUserId: user.id,
      mentionedByUserId: input.mentionedByUserId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });

    // In-app notification
    broadcastNotification(user.id, {
      type: "mention",
      title: "You were mentioned",
      body: `You were mentioned in a ${input.sourceType}`,
      link: `/dashboard/notes/${input.sourceId}`,
      mentionerId: input.mentionedByUserId,
      sourceId: input.sourceId,
    });

    // Email notification (best-effort)
    try {
      const [mentionedUser] = await db
        .select({ email: usersTable.email, displayName: usersTable.displayName })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      if (mentionedUser?.email) {
        void sendNotificationEmail(mentionedUser.email, {
          name: mentionedUser.displayName ?? "there",
          title: "You were mentioned",
          body: `You were mentioned in a ${input.sourceType}. Click to view.`,
          link: `/dashboard/notes/${input.sourceId}`,
        });
      }
    } catch {
      // non-blocking email failure
    }
  }
}

export async function getUserMentions(userId: string, limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(mentionsTable)
    .where(eq(mentionsTable.mentionedUserId, userId))
    .orderBy(desc(mentionsTable.createdAt))
    .limit(limit);
}

// ── Presence (heartbeat) ─────────────────────────────────────────────────────

export type PresenceStatus = "online" | "idle" | "offline";

export async function heartbeatPresence(userId: string, orgId: string, displayName: string, avatarUrl?: string, status: PresenceStatus = "online") {
  const db = getDb();
  // Use raw SQL for upsert since Drizzle onConflictDoUpdate needs a proper target
  await db.execute(sql`
    INSERT INTO presence (user_id, org_id, status, last_seen_at, display_name, avatar_url)
    VALUES (${userId}, ${orgId}, ${status}, now(), ${displayName}, ${avatarUrl ?? null})
    ON CONFLICT (user_id) DO UPDATE SET
      org_id = EXCLUDED.org_id,
      status = EXCLUDED.status,
      last_seen_at = now(),
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url
  `);
}

export async function setPresenceOffline(userId: string) {
  const db = getDb();
  await db.execute(sql`UPDATE presence SET status = 'offline', last_seen_at = now() WHERE user_id = ${userId}`);
}

export async function getOrgPresence(orgId: string) {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT user_id, status, last_seen_at, display_name, avatar_url
    FROM presence
    WHERE org_id = ${orgId}
      AND status != 'offline'
      AND last_seen_at > now() - interval '5 minutes'
    ORDER BY last_seen_at DESC
  `);
  return rows as any;
}

// ── Global search ─────────────────────────────────────────────────────────────

export interface SearchResult {
  type: "page" | "user" | "setting" | "note";
  title: string;
  description?: string;
  href: string;
  icon?: string;
}

const NAV_PAGES: SearchResult[] = [
  { type: "page", title: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { type: "page", title: "Profile", href: "/dashboard/profile", icon: "User" },
  { type: "page", title: "Security", href: "/dashboard/security", icon: "ShieldCheck" },
  { type: "page", title: "Sessions", href: "/dashboard/sessions", icon: "Monitor" },
  { type: "page", title: "Notifications", href: "/dashboard/notifications", icon: "Bell" },
  { type: "page", title: "Organizations", href: "/dashboard/organizations", icon: "Building2" },
  { type: "page", title: "API Keys", href: "/dashboard/api-keys", icon: "KeyRound" },
  { type: "page", title: "Webhooks", href: "/dashboard/webhooks", icon: "Webhook" },
  { type: "page", title: "Billing", href: "/dashboard/billing", icon: "CreditCard" },
  { type: "page", title: "Points & Rewards", href: "/dashboard/points", icon: "Award" },
  { type: "page", title: "Support", href: "/dashboard/support", icon: "LifeBuoy" },
  { type: "page", title: "Account", href: "/dashboard/account", icon: "UserCog" },
];

export async function globalSearch(_userId: string, orgId: string | null, query: string, limit = 10): Promise<SearchResult[]> {
  const db = getDb();
  const results: SearchResult[] = [];
  const q = query.toLowerCase();

  // 1. Navigable pages
  for (const page of NAV_PAGES) {
    if (page.title.toLowerCase().includes(q)) {
      results.push(page);
    }
  }

  // 2. Search within org notes
  if (orgId) {
    try {
      const notes = await db
        .select({ id: sharedNotesTable.id, title: sharedNotesTable.title })
        .from(sharedNotesTable)
        .where(and(
          eq(sharedNotesTable.orgId, orgId),
          eq(sharedNotesTable.archived, false),
          sql`(${sharedNotesTable.title} ILIKE ${`%${query}%`} OR ${sharedNotesTable.content} ILIKE ${`%${query}%`})`
        ))
        .limit(3);

      for (const note of notes) {
        results.push({
          type: "note",
          title: note.title,
          description: "Shared note",
          href: `/dashboard/notes/${note.id}`,
          icon: "file",
        });
      }
    } catch {
      // table may not exist yet
    }

    // 3. Org members
    try {
      const members = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
        .from(usersTable)
        .where(sql`${usersTable.displayName} ILIKE ${`%${query}%`} OR ${usersTable.email} ILIKE ${`%${query}%`}`)
        .limit(3);

      for (const member of members) {
        results.push({
          type: "user",
          title: member.displayName ?? member.email,
          description: member.email,
          href: `/dashboard/organizations/${orgId}`,
          icon: "User",
        });
      }
    } catch {
      // ignore
    }
  }

  return results.slice(0, limit);
}
