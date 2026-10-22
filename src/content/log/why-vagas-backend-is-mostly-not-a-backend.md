---
title: Why VAGA's Backend Is Mostly Not a Backend
excerpt: How a solo-built invoicing and bookkeeping system for Tunisian SMBs and accountants splits work between Supabase, a deliberately thin NestJS API, and a shared multi-tenant notification service running across dozens of self-hosted deployments.
publishedDate: 2026-08-15
coverImage: /images/log/why-vagas-backend-is-mostly-not-a-backend.webp
tags:
  - building-in-public
  - supabase
  - postgres
  - nestjs
  - angular
  - multi-tenancy
  - Tunisia
  - system-design
---

VAGA is an invoicing and bookkeeping system I've been building solo for the Tunisian market, SMBs and accountants use it to manage clients, suppliers, invoices, stock, and the tax paperwork that comes with running a company here.

The interesting part isn't the invoicing forms. It's the shape of the system underneath them, and a few decisions that turned out to matter more than they looked like they would at the time.

## The backend barely exists, on purpose

The Angular frontend talks to Postgres directly, through Supabase's client library. Every domain object, invoices, parties, stock movements, payments, has its own thin service that queries Supabase, and tenant isolation is enforced entirely by Postgres row-level security, not by application code. There's no REST layer standing between the UI and the data for basic CRUD.

A separate NestJS API exists, but it's deliberately small, and it only does the things Postgres and a browser genuinely can't:

- Rendering invoice PDFs and tax certificates, headless Chromium (Puppeteer) driving Handlebars templates, which has to run somewhere with a real filesystem and a browser engine, not in a Postgres
- Generating XML declarations for Tunisia's RS (*Retenue à la Source*, withholding tax) filings, a real government spec, complete with its own escaping rules (no accented characters, no `&<>"'`) and its own currency encoding (integer millimes, not decimals). This is live and in use, not a prototype.
- A handful of aggregation endpoints (stats, running balances, ledgers) where doing the join in application code is simpler than another database view.
- Staff/admin operations that need to bypass RLS deliberately, from a trusted context.

Everything else stays in Postgres. It's a bet that most CRUD doesn't need a bespoke API layer if your row-level security is doing the actual authorization work, and that the API should only grow to cover the specific things it's actually needed for.

## A tenant-isolation bug that reshaped the schema

Early on, "user" and "company" were the same row. That stopped working once a person needed to belong to more than one company, so the schema split into `users` (auth identity), `companies` (the actual business entity being invoiced from), and a `company_members` join table carrying role and permissions.
That split immediately produced a classic RLS trap: the policy on `users` that let company members view each other's profiles queried `company_members` to check membership, and the policy on `company_members` queried `users` right back. Postgres doesn't love a policy calling itself in a loop.
The fix is a `SECURITY DEFINER` helper function that checks membership with RLS bypassed internally, so the two policies stop calling each other:


```sql 
CREATE OR REPLACE FUNCTION public.is_company_member(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS ( SELECT 1 FROM public.company_members WHERE user_id = p_user_id AND company_id = get_active_company_id() ) $$; 
```

It's a small fix, but it's the kind of thing that only shows up once your permission model gets real, one identity, multiple companies, each with its own row-level boundary.

## Self-hosted, mostly

VAGA runs both ways: a managed cloud instance, and self-hosted per client, and self-hosted is the option most clients actually pick, largely for data residency. That split creates an obvious tension for anything that needs shared infrastructure: you don't want every self-hosted install running its own Redis cluster just to send a transactional email.
The answer was to carve transactional notifications out into their own NestJS service, deployed once, and called by every VAGA instance, cloud or self-hosted, over an API key. It's live today, handling delivery for both deployment types. Inside, it's a fairly standard queue-backed pipeline: BullMQ jobs render a tenant-branded template and hand off to Resend for delivery.
What's less standard is the webhook handling, since "webhook support" here means two separate directions:

- Inbound: Resend calls back with delivery/bounce events, verified with `svix` (the same signature scheme Resend itself uses).
- Outbound: once a send resolves, the service re-signs a normalized status payload with a per-tenant HMAC secret and POSTs it to that tenant's registered webhook URL, with five retries on exponential backoff, so the instance that requested the email can find out, independently, whether it actually landed.

Rate limiting is keyed by tenant ID instead of IP, for a reason that's easy to miss until you hit it: every self-hosted instance calls through the same outbound gateway, so limiting by IP would end up throttling unrelated tenants for each other's traffic.
Multi-tenancy here isn't an afterthought bolted onto a single-tenant service, it's the reason the service is API-key-and-tenant-scoped in the first place, down to how the per-tenant credential is looked up (a stored key prefix first, to avoid paying for a bcrypt comparison on every request before you've even found the right tenant).
