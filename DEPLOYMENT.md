# GitHub Pages deployment

Status: prepared locally; no remote repository is configured yet. No commit, push, hosted workflow run or live-site verification has been performed by the agent.

## Workflow

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and supports manual dispatch on `main`. It uses Node.js 22, `npm ci`, regression tests, strict TypeScript checking and a production build. A separate deployment job requires the successful build and publishes only the `dist` artifact to the `github-pages` environment. Deployment uses GitHub's built-in token; no personal token or npm deployment package is required. Action revisions are pinned to the versions in the [Vite Pages workflow example](https://vite.dev/guide/static-deploy.html).

`actions/configure-pages` supplies the actual site `base_path`. The build passes that path plus a trailing slash to Vite's `--base` option, supporting `/EO9YOH/`, a renamed project repository, or root/custom-domain hosting. Local builds retain `base: "./"`. See [Pages metadata outputs](https://github.com/actions/configure-pages/blob/main/action.yml).

## Create and connect the repository

Run these commands yourself with GitHub CLI (`gh`) installed. The project is already a Git repository on `main`; preserve its existing history. The commands create a **public** repository named `EO9YOH` in your signed-in personal account and connect `origin`, without pushing:

```sh
cd '/Users/teymurmammadov/Downloads/BME/Fall_2026-2027/AI Assisted Software Development/Lab /Lab 5/EO9YOH'
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh repo create EO9YOH --public --source=. --remote=origin
git remote -v
```

If the remote repository was already created empty through GitHub's website, use the following **instead of** `gh repo create` (with the same authenticated account):

```sh
github_owner=$(gh api user --jq .login)
git remote add origin "https://github.com/${github_owner}/EO9YOH.git"
```

Review and publish the local changes yourself:

```sh
git status --short
git diff --check
git add .github/workflows/deploy-pages.yml DEPLOYMENT.md PROMPTS.md
git diff --cached
git commit -m "Configure tested GitHub Pages deployment"
git push -u origin main
```

These assume prior lab changes are committed, as they were when this deployment increment began. Inspect `git status` before staging. `node_modules` and `dist` remain ignored; the workflow builds from source and the committed lockfile.

## GitHub account/repository settings

1. Open the repository → **Settings → Pages → Build and deployment → Source → GitHub Actions**. Select this, not branch-based deployment. See [GitHub's custom workflow instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
2. In **Settings → Actions → General**, ensure Actions and the official actions used by the workflow are allowed. The workflow declares its required token permissions; organization policies must permit them. No broad repository write permission is needed.
3. The `github-pages` environment must permit deployment from `main`. For unattended deployment on every push, it must not require a manual reviewer or waiting approval. Keep HTTPS enabled for the site and use Chrome with WebGPU.
4. If the first run happened before Pages was enabled and failed during configuration, enable the setting, then use **Actions → Deploy STILLFRAME to GitHub Pages → Run workflow → main** (or rerun the failed run).

Public repositories support Pages on GitHub Free; private repositories require an eligible plan. See [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Verify the live site

After both jobs succeed, use the deployment URL shown in Actions/Settings → Pages, normally `https://YOUR_USERNAME.github.io/EO9YOH/`. A successful Actions run alone is not live gameplay verification.

- Open that exact URL in a fresh Chrome Incognito window. Confirm title, stylesheet, game startup and level entry.
- Check DevTools Network/Console for asset 404s, JavaScript or WebGPU errors. Check mouse direction, movement-dependent slow motion and relevant lab gameplay checks; existing unresolved bugs remain documented in `BUGS.md`.
- Push a small visible change to `main` yourself, wait for the automatic workflow, and check that the change reaches the live URL without manually redeploying. Record the URL and observed results before calling deployment verified.

For a local repository-path build check:

```sh
npm ci
npm test
npm run typecheck
npm run build -- --base=/EO9YOH/
npm run preview -- --base=/EO9YOH/
# Open http://localhost:4173/EO9YOH/
```

Local automated results for this increment: `npm ci --offline --no-audit --no-fund` succeeded using cached packages; all 19 regression tests passed; `npm run typecheck` passed; the `/EO9YOH/` production build passed with 44 modules transformed. Emitted JavaScript and CSS URLs use `/EO9YOH/assets/` and resolve to existing files in `dist`. The workflow YAML parses and its deployment job requires the build job. `git diff --check` passed. Hosted Actions execution and live browser verification remain pending.
