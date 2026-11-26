#!/usr/bin/env bash
# Run from frontend/ before every commit:  bash check-confirm.sh
# Fails (exit 1) if the confirm() migration left any of the known bugs.
fail=0

echo "1) Files calling useConfirm() without importing it"
for f in $(grep -rl "useConfirm(" src --include=*.vue); do
  grep -qE "import[^;]*useConfirm" "$f" || { echo "   MISSING IMPORT: $f"; fail=1; }
done

echo "2) confirm( calls that are not awaited (delete would run with no confirmation)"
bad=$(grep -rnE "confirm\(" src --include=*.vue | sed -E 's/const \{ confirm \} = useConfirm\(\)//g' \
  | grep -E "confirm\(" | grep -vE "await[ (]*(useConfirm\(\)\.)?confirm\(|import |window\.|^\S+:\s*(//|\*)" || true)
[ -n "$bad" ] && { echo "$bad" | cut -c1-150; fail=1; }

echo "3) Native window.confirm / alert"
if grep -rnE "window\.(confirm|alert)\(|[^.a-zA-Z]alert\(" src --include=*.vue; then fail=1; fi

echo "4) Parse / lint errors (eslint)"
npx eslint $(grep -rlE "confirm\(|useConfirm" src --include=*.vue) >/tmp/eslint.log 2>&1 || { grep -B1 -E "error" /tmp/eslint.log | cut -c1-150 | head -20; fail=1; }

echo "5) Production build"
npx vite build >/tmp/vb.log 2>&1 || { tail -5 /tmp/vb.log; fail=1; }

[ $fail -eq 0 ] && echo "ALL CHECKS PASSED" || echo "CHECKS FAILED"
exit $fail