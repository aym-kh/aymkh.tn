import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const log = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/log" }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    publishedDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().optional(),
  }),
});

export const collections = { log };
