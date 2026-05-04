# Login Spec

## Scenario: happy-path

**Given** a user with valid credentials
**When** they POST /api/login with correct password
**Then** they receive a 200 with session cookie
**And** subsequent requests are authenticated

## Scenario: wrong-password

**Given** a user with valid email but wrong password
**When** they POST /api/login
**Then** they receive 401
**And** no cookie is set
