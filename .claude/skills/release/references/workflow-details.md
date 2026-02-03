# Release Workflow Details

Technical details about the CRUX plugin release automation.

## Workflow Architecture

The release workflow (`.github/workflows/release.yml`) consists of three jobs:

### 1. validate-release

Triggered when a tag matching `crux-*-v*` is pushed.

- Extracts plugin name and version from the tag
- Reads version from `plugin.json`
- **Fails if tag version doesn't match plugin.json version**

### 2. create-release

Runs after successful validation.

- Creates a GitHub Release with the tag
- Generates release notes from commits since last tag
- Attaches any relevant artifacts

### 3. update-marketplace

Runs after release creation.

- Updates `marketplace.json` with new `ref` value
- Commits and pushes the change to main branch
- Uses a bot token for automated commits

## Tag Naming Convention

Tags must follow this exact format:

```
crux-<plugin-name>-v<major>.<minor>.<patch>
```

Examples:
- `crux-hive-v4.4.1`
- `crux-monitor-v1.2.0`
- `crux-hive-v5.0.0`

The workflow parses the tag to extract:
- **Plugin name**: Used to locate the correct plugin directory
- **Version**: Validated against `plugin.json`

## Version Sync Requirement

Both version files must contain identical versions:

| File | Purpose |
|------|---------|
| `plugin.json` | Claude Code plugin manifest, used by release workflow |
| `package.json` | Node/Bun package manifest, used by workspace resolution |

The `scripts/check-version-sync.ts` script validates this locally. Run before committing:

```bash
bun run scripts/check-version-sync.ts
```

## Troubleshooting

### Tag version mismatch error

**Symptom**: Release workflow fails with "Version mismatch" error.

**Cause**: The tag version doesn't match the version in `plugin.json`.

**Solution**:
1. Delete the incorrect tag:
   ```bash
   git tag -d crux-<plugin>-vX.Y.Z
   git push origin :refs/tags/crux-<plugin>-vX.Y.Z
   ```
2. Fix the version in `plugin.json` and `package.json`
3. Commit and push the fix
4. Create the tag again with the correct version

### Marketplace update fails

**Symptom**: Release succeeds but `marketplace.json` isn't updated.

**Cause**: Usually a permissions issue or merge conflict.

**Solution**:
1. Check the workflow logs for specific error
2. Manually update `marketplace.json` if needed:
   ```json
   {
     "plugins": {
       "<plugin-name>": {
         "ref": "crux-<plugin-name>-vX.Y.Z"
       }
     }
   }
   ```
3. Commit and push the manual fix

### CI validation fails

**Symptom**: PR checks fail on version-related validation.

**Cause**: Versions in `plugin.json` and `package.json` don't match.

**Solution**:
1. Run local validation: `bun run scripts/check-version-sync.ts`
2. Ensure both files have identical version strings
3. Commit the fix and push

### Tag already exists

**Symptom**: `git push` fails because tag already exists on remote.

**Cause**: A previous release attempt created the tag.

**Solution**:
1. If the release failed, delete the tag:
   ```bash
   git push origin :refs/tags/crux-<plugin>-vX.Y.Z
   ```
2. Fix any issues and recreate the tag
3. If the release succeeded, bump to a new version instead

## Release Checklist

Before tagging:
- [ ] Version bumped in `plugin.json`
- [ ] Version bumped in `package.json`
- [ ] Versions match (run `bun run scripts/check-version-sync.ts`)
- [ ] PR merged to main
- [ ] Local main branch is up to date

After tagging:
- [ ] Release workflow completed successfully
- [ ] GitHub Release created with correct notes
- [ ] `marketplace.json` updated with new ref
