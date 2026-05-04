# Login Design

## Architecture

- Frontend: React form component
- Backend: POST /api/login with bcrypt hash
- Session: HttpOnly cookie, 24h expiry

## Data Model

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
```
