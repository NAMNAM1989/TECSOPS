# Worktree Integration Manager

Hệ thống tự động verify, test, và merge thay đổi từ Git Worktree vào MAIN một cách an toàn.

## Tổng quan

Sau khi Cursor Agent hoàn thành nhiệm vụ trong worktree, chạy **một task duy nhất** để thực hiện toàn bộ pipeline:

```
WORKTREE → Audit → Safe Auto Fix → Quality Gate → Performance Gate
→ Test → Build → E2E → Commit → Merge MAIN → Test MAIN → Report
```

MAIN luôn được bảo vệ tuyệt đối — pipeline dừng ngay nếu bất kỳ gate nào thất bại.

## Quick vs Deep

| | QUICK | DEEP |
|---|-------|------|
| **Mục đích** | Feature nhỏ, bug fix, hotfix | Feature lớn, refactor, trước release |
| **Lint + Typecheck + Test + Build** | Có | Có |
| **Deploy Check** | Có | Có |
| **E2E** | `npm run qa:smoke` (smoke) | `npm run test:e2e` + `test:e2e:a11y` |
| **Performance audit** | Static analysis | Static analysis (sâu hơn) |
| **Thời gian** | ~2-5 phút | ~5-15 phút |

## Cách tạo Worktree

```powershell
# Từ thư mục MAIN
git worktree add ../TECSOPS-my-feature -b cursor/my-feature

# Mở worktree trong Cursor
cd ../TECSOPS-my-feature
```

Cursor Agent làm việc trong worktree này. MAIN không bị ảnh hưởng.

## Cách hoàn thành Worktree

1. Agent hoàn thành task trong worktree
2. Review thay đổi: `git status`, `git diff`
3. Xác nhận không có debug code, secrets, hoặc unrelated changes
4. Chạy integration (xem bên dưới)

## Cách chạy Merge

### Qua Cursor Task (khuyến nghị)

```
Ctrl + Shift + P
→ Tasks: Run Task
→ VERIFY & MERGE TO MAIN        (Quick)
→ DEEP AUDIT & MERGE TO MAIN    (Deep)
→ VERIFY & MERGE (DRY RUN)      (Test pipeline, không merge)
```

### Qua PowerShell trực tiếp

```powershell
# Quick mode
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/integration/verify-and-merge.ps1

# Deep mode
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/integration/verify-and-merge.ps1 -Mode Deep

# Dry run (validation only, no commit/merge)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/integration/verify-and-merge.ps1 -DryRun
```

## Quality Gates

Pipeline tự phát hiện commands từ `package.json`:

| Gate | Command | Required |
|------|---------|----------|
| Lint (src) | `npm run lint` | Yes |
| Lint (server) | `npm run lint:server` | Yes |
| Typecheck | `npm run typecheck` | Yes |
| Tests | `npm run test` | Yes |
| Build | `npm run build` | Yes |
| Deploy Check | `npm run deploy:check` | Yes |
| E2E Smoke (Quick) | `npm run qa:smoke` | No |
| E2E Read-only (Deep) | `npm run test:e2e` | No |
| E2E A11y (Deep) | `npm run test:e2e:a11y` | No |

Gate không tồn tại → report `NOT CONFIGURED`, không coi là FAIL.

Gate required FAIL → **STOP**, MAIN không bị sửa.

## Performance Gate

Static analysis trên changed files, kiểm tra:

- Timers/listeners without cleanup
- Duplicate fetch patterns
- Heavy dependencies without lazy loading
- `use client` boundary issues
- Infinite loop patterns

Chỉ report recommendations — **không tự động refactor**.

Bundle baseline: nếu `dist/` tồn tại, report kích thước hiện tại. Không có before/after comparison → report `PERFORMANCE BASELINE NOT AVAILABLE`.

## Integration Lock

Chỉ **một worktree** được merge MAIN tại một thời điểm.

- Lock file: `.git/integration.lock`
- Chứa: PID, branch, worktree path, timestamp, mode
- Stale lock (process đã chết) → tự cleanup
- Worktree khác gặp lock → report `INTEGRATION LOCKED` và STOP

## Safe Auto Fix

Tự động sửa (high confidence):

- ESLint auto-fix (`eslint --fix`) cho src và server

**Không tự động:**

- Architecture rewrite, DB migration, dependency upgrade
- Auth rewrite, API contract changes
- Destructive operations

## Xử lý Conflict

Nếu merge conflict:

1. Pipeline **STOP** ngay
2. Merge được **abort** an toàn
3. Report `MERGE CONFLICT` + danh sách conflicting files
4. MAIN không bị sửa

Resolve conflict thủ công:

```powershell
cd D:\TECSOPS          # main worktree
git checkout main
git merge cursor/my-feature
# resolve conflicts manually
git add .
git commit
```

## Xử lý Failed Test

### Worktree fail (trước merge)

Pipeline dừng tại gate thất bại. MAIN không bị ảnh hưởng. Sửa lỗi trong worktree và chạy lại.

### Post-merge fail (MAIN fail sau merge)

Merge đã hoàn thành nhưng validation trên MAIN thất bại:

```
POST-MERGE VALIDATION FAILED
Stage:   Build
Branch:  cursor/my-feature
Merge commit: abc1234
```

Rollback thủ công an toàn:

```powershell
cd D:\TECSOPS
git revert -m 1 <merge-commit-sha>
# hoặc nếu chưa push:
git reset --merge ORIG_HEAD
```

**Không tự động rollback** — cần review trước khi revert.

## Git Diff Audit

Trước khi chạy gates, pipeline audit:

- **Secrets**: API keys, passwords, tokens, Bearer tokens
- **Debug code**: `console.log`, `debugger`, `TODO: remove`, `FIXME: temp`
- **Dependency changes**: package.json modifications
- **Scope**: liệt kê tất cả changed files

Secret suspect → **FAIL**, pipeline dừng.

## Cấu trúc Files

```
scripts/integration/
  verify-and-merge.ps1       # Entry point
  lib/
    Common.ps1               # Logging, utilities
    Detect.ps1               # PM, worktree, gate detection
    Lock.ps1                 # Integration lock
    Audit.ps1                # Diff audit, secrets
    AutoFix.ps1              # Safe auto-fix
    Gates.ps1                # Quality gate runner
    Performance.ps1          # Performance static check
    Merge.ps1                # Git merge operations

.cursor/rules/
  integration-manager.mdc    # Cursor agent rules

.vscode/
  tasks.json                 # Cursor/VS Code tasks
```

## Troubleshooting

### "Cannot integrate from MAIN branch itself"

Bạn đang chạy script từ MAIN worktree. Chạy từ feature worktree.

### "No changes to integrate"

Worktree sạch, không có thay đổi. Commit changes trước hoặc kiểm tra đúng worktree.

### "INTEGRATION LOCKED"

Worktree khác đang merge. Đợi hoàn thành hoặc kiểm tra stale lock:

```powershell
Get-Content .git/integration.lock
# Nếu PID không còn chạy, xóa lock:
Remove-Item .git/integration.lock
```

### "Main worktree has uncommitted changes"

Commit hoặc stash changes trên MAIN trước khi merge.

### E2E fail locally

E2E cần server chạy. Khởi động dev server trước:

```powershell
npm run dev
# Terminal khác:
npm run qa:smoke
```

### PowerShell execution policy

Script dùng `-ExecutionPolicy Bypass`. Nếu vẫn bị block:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Safety Rules

Pipeline **KHÔNG BAO GIỜ**:

- `git reset --hard main`
- `git push --force`
- Bỏ qua failing required tests
- Xóa unrelated user work
- Tự resolve merge conflict phức tạp
- Merge khi MAIN có uncommitted changes
- Fake performance metrics
- Claim PASS mà không chạy validation thực tế
