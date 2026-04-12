#!/usr/bin/env bash

set -euo pipefail

repo_root="${1:-$(pwd)}"

required_files=(
  "README.md"
  "docs/architecture.md"
  "docs/manual.md"
  "docs/roadmap.md"
  "docs/deployment-guide.md"
  "docs/runbook.md"
  "docs/CHANGELOG.md"
  "docs/risks/risk-register.md"
  "project-control.yaml"
)

missing=0

for relative_path in "${required_files[@]}"; do
  if [[ ! -f "${repo_root}/${relative_path}" ]]; then
    echo "Missing required governance file: ${relative_path}"
    missing=1
  fi
done

if [[ ${missing} -ne 0 ]]; then
  exit 1
fi

echo "Governance preflight passed."
