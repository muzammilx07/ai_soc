# Next Frontend (Separate)

This is a separate Next.js frontend for your SOC platform.

## Included

- Google authentication via NextAuth
- Landing page
- Dashboard shell and left navigation
- Cases table page (SIRP-style)
- Case detail report page
- Alerts page with AI + automation placeholders
- Playbook Kanban page

## Setup

1. Copy `.env.local.example` to `.env.local`
2. Fill Google OAuth credentials and NEXTAUTH values
3. Install dependencies and run dev server

## Commands

- npm install
- npm run dev

## AI Integration (next step)

After frontend completion, connect these backend endpoints:

- POST /prediction for AI alert classification
- POST /response/trigger for automated response actions
- GET /response/logs for action audit trail
- GET /alerts and GET /incidents for case lifecycle
