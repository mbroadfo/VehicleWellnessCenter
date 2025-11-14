<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit the VS Code Copilot documentation. -->
- Original Project Vision: Build "Vehicle Wellness Center" tracking MongoDB Atlas vehicle events, AWS Lambda (Node.js) logic, API Gateway with JWT, Secrets Manager, React SPA on S3 with chat pane and vehicle history timeline, infrastructure via Terraform, npm-based workflows, incremental milestones.
- [x] Verify that the copilot-instructions.md file in the .github directory is created. Created template file with checklist and guidelines.

- [x] Clarify Project Requirements Confirmed stack: Terraform IaC, AWS Lambda (Node.js) backend, MongoDB Atlas, React SPA on S3 with chat UI, API Gateway JWT auth, npm tooling.
	<!-- Ask for project type, language, and frameworks if not specified. Skip if already provided. -->

- [x] Scaffold the Project
	Scaffolded infrastructure (Terraform), backend (Node.js Lambda), and frontend (Vite React TS). Note: decline Vite auto-start prompts to avoid spawning dev servers during scaffolding.

- [x] Customize the Project
	Created `PLAN.md` detailing milestones from MongoDB foundation through multi-vehicle scaling.

- [ ] Install Required Extensions
	<!-- ONLY install extensions provided mentioned in the get_project_setup_info. Skip this step otherwise and mark as completed. -->

- [ ] Compile the Project
	<!--
	Verify that all previous steps have been completed.
	Install any missing dependencies.
	Run diagnostics and resolve any issues.
	Check for markdown files in project folder for relevant instructions on how to do this.
	-->

- [ ] Create and Run Task
	<!--
	Verify that all previous steps have been completed.
	Check https://code.visualstudio.com/docs/debugtest/tasks to determine if the project needs a task. If so, use the create_and_run_task to create and launch a task based on package.json, README.md, and project structure.
	Skip this step otherwise.
	 -->

- [ ] Launch the Project
	<!--
	Verify that all previous steps have been completed.
	Prompt user for debug mode, launch only if confirmed.
	 -->

- [ ] Ensure Documentation is Complete
	<!--
	Verify that all previous steps have been completed.
	Verify that README.md and the copilot-instructions.md file in the .github directory exists and contains current project information.
	Clean up the copilot-instructions.md file in the .github directory by removing all HTML comments.
	 -->

<!--
## Execution Guidelines
PROGRESS TRACKING:
- If any tools are available to manage the above todo list, use it to track progress through this checklist.
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
- If the project setup information has additional rules, follow them strictly.
- When chaining PowerShell commands, use ';' separators instead of '&&' to avoid shell errors.
- During Vite scaffolding, explicitly choose not to auto-install/start the dev server to keep terminals clean and avoid unintended processes.
- When writing Markdown, ensure headings and lists have blank lines above and below to satisfy linting rules.
- Use the exact name "Vehicle Wellness Center" across docs, code, and tooling; never revert to earlier naming variants.
- Keep Terraform configuration directly under `infra/`; do not create nested `terraform/` directories unless explicitly required.
- All workspace packages (backend, frontend) must have `typecheck` and `test` scripts for root-level npm workspace commands to work.
- Always run `terraform fmt` in infra/ before committing Terraform changes.
- Region is us-west-2 for all AWS and Atlas resources - update any us-east-1 references found in documentation.
- All tooling must be Node.js-based for cross-platform compatibility - no PowerShell, Bash, or OS-specific scripts.
- Lambda deployment packages are built with `backend/scripts/build-lambda.js` using archiver package.
- Infrastructure commands use `npm run infra:*` (plan, apply, destroy) - credentials loaded via `infra/load-tf-env.js`.
- Test utilities should auto-cleanup without manual intervention - avoid Ctrl+C patterns that block automation.
- Application deployment uses `npm run deploy` for fast Lambda code updates without Terraform.
- Terraform files are automatically formatted with `terraform fmt` before plan/apply operations.
- API Gateway HTTP API v2 logging requires CloudWatch Logs resource policies, not IAM roles like REST APIs.
- IAM policy `terraform-vwc-core` must be iteratively updated as Terraform reveals missing permissions.
- CloudWatch log retention should be 3 days for cost optimization in dev environment.
- Lambda test strategy: Write validation-only tests (input checks, error cases), skip complex MongoDB mocking.
- Utility scripts (seed, test-connection) must call process.exit(0) after completion to prevent hanging on connection pools.
- Build scripts should be parameterized to support multiple Lambda functions with a single implementation.
- JWT authentication uses Auth0 with RS256 (RSA public key). Each project has its own Auth0 tenant and API.
- Auth0 configuration requires two variables: auth0_domain (tenant.auth0.com) and auth0_audience (API identifier).
- Auth0 M2M applications enable automated token retrieval via Client Credentials flow.
- Auth0 M2M credentials (client_id, client_secret) stored in AWS Secrets Manager, not environment variables.
- Token caching pattern: module-level cache with expiration buffer (5 minutes before expiry).
- Lambda token caching survives container lifetime (~15-45 minutes), not shared across containers.
- For shared token cache, use Parameter Store (future enhancement documented in job jar).
- Integration tests automatically fetch Auth0 tokens - no manual AUTH0_TOKEN environment variable needed.
- Never create secrets in AWS - only document what secrets the user needs to create.
- Single Lambda architecture: Router pattern in index.ts dispatches to routes/ directory based on method + path regex.
- All Lambda handlers use APIGatewayProxyEventV2 for consistency with HTTP API v2.
- Route handlers live in src/routes/ directory with imports from ../lib/ (not ./lib/).
- ESLint config disables unsafe type rules for src/routes/**/*.ts to allow MongoDB document handling.
- AI orchestrator (Gemini) is core application logic, not just another endpoint - consolidate with CRUD operations.
- Gemini model: Use gemini-2.5-flash (stable, free tier supported). Experimental models may have quota restrictions.
- Function calling pattern: AI calls existing HTTP endpoints, not direct database access.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.

## MILESTONE COMMIT CHECKLIST

When the user indicates a milestone has been reached, execute this checklist systematically:

### 1. Review Uncommitted Files
- Run `git status` to list all uncommitted changes
- Review each file and categorize:
  - **Keep**: Essential code, config, documentation
  - **Delete**: Temporary files, scaffolding, build artifacts, test data
- Delete any files that don't belong in the repository
- Confirm `.gitignore` is properly excluding build outputs, secrets, node_modules, etc.

### 2. Security Audit
- Search all files for hardcoded secrets, passwords, API keys, tokens
- Check code files (*.ts, *.js, *.tsx, *.jsx)
- Check documentation (*.md, *.txt)
- Check configuration (*.json, *.yaml, *.env.example)
- Check test files for exposed credentials
- Verify all secrets use environment variables or AWS Secrets Manager
- Confirm `.env` files are gitignored and only `.env.example` templates exist

### 3. Prepare Changelog Entry
- Read existing `CHANGELOG.md` (create if missing)
- Add new entry with today's date
- Use format: `## [Unreleased] - YYYY-MM-DD`
- Multiple entries per day are normal - use subsections or bullets
- Categories: Added, Changed, Fixed, Removed, Security, Infrastructure
- Write clear, user-facing descriptions of changes
- Include technical details for developers

### 4. Documentation Review
- Check `README.md` for accuracy and completeness
- Review workspace-specific docs in `docs/`
- Update component READMEs (`backend/README.md`, `frontend/README.md`, `infra/README.md`)
- Eliminate duplicate information - link instead of copy
- Ensure commands and examples are current
- Update architecture diagrams or descriptions if changed
- Check that all markdown follows linting rules (blank lines around headings/lists)

### 5. API Documentation
- If APIs changed, update Swagger/OpenAPI specs
- Document new endpoints, parameters, responses
- Update request/response examples
- Version API documentation appropriately
- Confirm all Lambda function signatures are documented

### 6. Code Quality Check
- Run `npm run lint` from root - fix all errors
- Run `npm run typecheck` - resolve all type errors
- Run `npm run test` - ensure all tests pass
- Check for any build warnings
- Terraform files are auto-formatted (no manual action needed)
- Review ESLint config for any disabled rules that should be re-enabled

### 7. Update Copilot Instructions
- Review conversation for patterns, corrections, or issues
- Add new development rules based on lessons learned
- Update naming conventions if any inconsistencies found
- Document new tooling or workflow patterns
- Add project-specific conventions discovered during development
- Remove outdated or superseded instructions

### 8. Commit & Push
- Stage all changes: `git add .`
- Write descriptive commit message following convention:
  - Format: `<type>(<scope>): <subject>`
  - Types: feat, fix, docs, style, refactor, test, chore, infra
  - Examples:
    - `feat(backend): add MongoDB collections with validators`
    - `infra(terraform): configure M0 free tier Atlas cluster`
    - `docs: update README with workspace commands`
    - `chore: add milestone commit checklist to copilot instructions`
- Commit: `git commit -m "message"`
- Push: `git push origin main` (or current branch)

### Execution Notes:
- Execute checklist items sequentially
- Report status after each major step
- Ask for user confirmation before destructive actions (file deletion, etc.)
- If issues are found, fix them before proceeding to commit
- Keep the user informed of progress without excessive verbosity

-->
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
