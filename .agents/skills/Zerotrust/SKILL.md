```markdown
# Zerotrust Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the Zerotrust JavaScript codebase. It covers file naming, import/export styles, commit message conventions, and how to write and organize tests. While no specific frameworks or automated workflows were detected, this guide provides best practices and suggested commands for maintaining consistency and quality in your contributions.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userAuth.js`, `apiHandler.test.js`

### Import Style
- Both ES6 and CommonJS import styles are used. Maintain consistency within a file.
  - ES6 Example:
    ```js
    import { verifyToken } from './authUtils';
    ```
  - CommonJS Example:
    ```js
    const { verifyToken } = require('./authUtils');
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```js
    // authUtils.js
    export function verifyToken(token) { ... }
    export function hashPassword(pw) { ... }
    ```

### Commit Message Conventions
- Use **conventional commits** with the `fix` prefix for bug fixes.
  - Example: `fix: correct token expiration logic`
- Keep commit messages concise (average ~38 characters).

## Workflows

### Code Contribution
**Trigger:** When adding or updating code  
**Command:** `/contribute`

1. Name new files using camelCase.
2. Use named exports for all functions or constants.
3. Maintain consistent import style within each file.
4. Write or update corresponding test files (`*.test.js`).
5. Commit changes using a conventional commit message (e.g., `fix: update password validation`).

### Testing
**Trigger:** Before submitting a pull request or merging changes  
**Command:** `/test`

1. Locate or create test files following the `*.test.js` pattern.
2. Add or update tests for new or changed functionality.
3. Run all tests using the project's test runner (framework is unspecified; consult project documentation or use `npm test` if available).
4. Ensure all tests pass before proceeding.

## Testing Patterns

- Test files are named using the pattern `*.test.js`.
- Place test files alongside the code they test or in a dedicated `tests` directory.
- Testing framework is not specified; follow existing patterns or consult the project maintainer.
- Example test file:
  ```js
  // authUtils.test.js
  import { verifyToken } from './authUtils';

  test('verifyToken returns true for valid token', () => {
    expect(verifyToken('valid-token')).toBe(true);
  });
  ```

## Commands
| Command     | Purpose                                   |
|-------------|-------------------------------------------|
| /contribute | Steps for contributing code               |
| /test       | Steps for running and writing tests       |
```
