# Soma security

## Model

Soma handles personal health data as sensitive information.

- Authentication is Google-only through Supabase Auth.
- Every user table has row-level security and resource ownership checks.
- Google Health access and refresh tokens are encrypted with AES-256-GCM.
- OAuth token tables and executable Coach proposals are inaccessible through the authenticated browser client.
- Route inputs use runtime schemas and strict size limits.
- Cookie-authenticated writes require a same-origin request.
- User-specific responses are private and not cached.
- A nonce-based Content Security Policy, clickjacking protection, `nosniff`, referrer, and permissions headers are applied centrally.
- No raw HTML rendering, dynamic code execution, or user-controlled outbound URL fetching is used.

## AI boundary

Soma Coach receives only the summarized metrics needed for a question. xAI requests use structured output, `store: false`, and a pseudonymous user reference. Model output is validated again before use. Any write becomes a server-stored preview and requires explicit user confirmation.

## Secrets

Secrets belong only in local untracked environment files and deployment secret stores. Never place private values in a `NEXT_PUBLIC_` variable. Rotate any credential that appears in Git history, logs, screenshots, or client responses.

## Reporting

For a suspected vulnerability, do not include real health records or credentials in an issue. Contact the repository owner privately with the affected route, impact, and reproduction using synthetic data.
