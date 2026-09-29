import { createClient } from "contentful";
import type { Entry, EntryFieldTypes, EntrySkeletonType } from "contentful";

export interface LogEntrySkeleton extends EntrySkeletonType {
  contentTypeId: "logEntry";
  fields: {
    title: EntryFieldTypes.Symbol;
    slug: EntryFieldTypes.Symbol;
    excerpt?: EntryFieldTypes.Text;
    body: EntryFieldTypes.RichText;
    tags: EntryFieldTypes.Array<EntryFieldTypes.Symbol>;
    coverImage?: EntryFieldTypes.AssetLink;
    publishedDate: EntryFieldTypes.Date;
  };
}

// Pinned to the "withoutUnresolvableLinks" chain modifier used in getAllLogEntries
// below — this is what makes `coverImage` resolve to `Asset | undefined` instead of
// a much messier `Asset | UnresolvedLink<'Asset'> | undefined` union.
export type LogEntry = Entry<LogEntrySkeleton, "WITHOUT_UNRESOLVABLE_LINKS">;

const spaceId = import.meta.env.CONTENTFUL_SPACE_ID;
const accessToken = import.meta.env.CONTENTFUL_ACCESS_TOKEN;
const environment = import.meta.env.CONTENTFUL_ENVIRONMENT || "master";

const isConfigured = Boolean(spaceId && accessToken);

if (!isConfigured) {
  console.warn(
    "[contentful] CONTENTFUL_SPACE_ID / CONTENTFUL_ACCESS_TOKEN not set — Log will build with zero entries.",
  );
}

const client = isConfigured
  ? createClient({ space: spaceId!, accessToken: accessToken!, environment })
  : null;

export async function getAllLogEntries(): Promise<LogEntry[]> {
  if (!client) return [];

  const res = await client.withoutUnresolvableLinks.getEntries<LogEntrySkeleton>({
    content_type: "logEntry",
    order: ["-fields.publishedDate"],
  });

  return res.items;
}

export function coverImageUrl(entry: LogEntry): string | null {
  const url = entry.fields.coverImage?.fields?.file?.url;
  return url ? `https:${url}` : null;
}