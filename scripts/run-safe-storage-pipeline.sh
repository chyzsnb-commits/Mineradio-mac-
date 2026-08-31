#!/bin/bash

set -euo pipefail
umask 077

if [[ "$#" -lt 5 || "$#" -gt 6 ]]; then
  echo "usage: run-safe-storage-pipeline.sh <frame-to-new|proof-to-old> <old-exec> <recovery-host> <new-exec> <output-dir> [new-mode]" >&2
  exit 64
fi

direction="$1"
old_exec="$2"
recovery_host="$3"
new_exec="$4"
output_dir="$5"
new_mode="${6:-}"

for absolute_path in "${old_exec}" "${recovery_host}" "${new_exec}" "${output_dir}"; do
  if [[ "${absolute_path}" != /* ]]; then
    echo "all pipeline paths must be absolute" >&2
    exit 64
  fi
  if [[ "$(/bin/realpath "${absolute_path}")" != "${absolute_path}" ]]; then
    echo "the pipeline refuses paths containing symbolic-link aliases" >&2
    exit 77
  fi
done
if [[ ! -x "${old_exec}" || ! -f "${recovery_host}" || ! -x "${new_exec}" || ! -d "${output_dir}" ]]; then
  echo "the pipeline executable, host, or output directory is missing" >&2
  exit 66
fi
if [[ -L "${old_exec}" || -L "${recovery_host}" || -L "${new_exec}" || -L "${output_dir}" ]]; then
  echo "the pipeline refuses symbolic links" >&2
  exit 77
fi

current_uid="$(/usr/bin/id -u)"
output_uid="$(/usr/bin/stat -f '%u' "${output_dir}")"
output_mode="$(/usr/bin/stat -f '%Lp' "${output_dir}")"
if [[ "${output_uid}" != "${current_uid}" || $((8#${output_mode} & 077)) -ne 0 ]]; then
  echo "the pipeline output directory must be private and user-owned" >&2
  exit 77
fi
if [[ -n "$(/usr/bin/find "${output_dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "the pipeline output directory must start empty" >&2
  exit 73
fi

case "${direction}" in
  frame-to-new)
    case "${new_mode}" in
      --mineradio-safe-storage-install|--mineradio-safe-storage-rollback-delete|--mineradio-safe-storage-commit) ;;
      *) echo "unsupported new-app handoff mode" >&2; exit 64 ;;
    esac
    ;;
  proof-to-old)
    if [[ -n "${new_mode}" ]]; then
      echo "proof-to-old accepts no new-app mode" >&2
      exit 64
    fi
    ;;
  *) echo "unsupported pipeline direction" >&2; exit 64 ;;
esac

migration_home="${HOME}"
migration_user="$(/usr/bin/id -un)"
migration_tmp="${output_dir}/runtime-tmp"
if [[ ! -d "${migration_home}" ]]; then
  echo "the migration home directory is unavailable" >&2
  exit 77
fi
/bin/mkdir -m 0700 "${migration_tmp}"

old_stdout="${output_dir}/old.stdout.json"
old_stderr="${output_dir}/old.stderr.log"
old_status="${output_dir}/old.status"
new_stdout="${output_dir}/new.stdout.json"
new_stderr="${output_dir}/new.stderr.log"
new_status="${output_dir}/new.status"
for output_file in "${old_stdout}" "${old_stderr}" "${old_status}" \
    "${new_stdout}" "${new_stderr}" "${new_status}"; do
  : > "${output_file}"
  /bin/chmod 0600 "${output_file}"
done

old_environment=(
  /usr/bin/env -i
  "HOME=${migration_home}"
  "USER=${migration_user}"
  "LOGNAME=${migration_user}"
  "TMPDIR=${migration_tmp}"
  "PATH=/usr/bin:/bin:/usr/sbin:/sbin"
  "LANG=C"
  "LC_ALL=C"
  "ELECTRON_RUN_AS_NODE=1"
)
new_environment=(
  /usr/bin/env -i
  "HOME=${migration_home}"
  "USER=${migration_user}"
  "LOGNAME=${migration_user}"
  "TMPDIR=${migration_tmp}"
  "PATH=/usr/bin:/bin:/usr/sbin:/sbin"
  "LANG=C"
  "LC_ALL=C"
)

set +e
if [[ "${direction}" == "frame-to-new" ]]; then
  (
    "${old_environment[@]}" "${old_exec}" "${recovery_host}" export-frame \
      3>&1 1>"${old_stdout}" 2>"${old_stderr}"
    /usr/bin/printf '%s\n' "$?" > "${old_status}"
  ) | (
    "${new_environment[@]}" "${new_exec}" "${new_mode}" \
      3<&0 0</dev/null 1>"${new_stdout}" 2>"${new_stderr}"
    /usr/bin/printf '%s\n' "$?" > "${new_status}"
  )
else
  (
    "${new_environment[@]}" "${new_exec}" --mineradio-safe-storage-export-commit-proof \
      3>&1 1>"${new_stdout}" 2>"${new_stderr}"
    /usr/bin/printf '%s\n' "$?" > "${new_status}"
  ) | (
    "${old_environment[@]}" "${old_exec}" "${recovery_host}" cleanup-recovery-from-proof \
      3<&0 0</dev/null 1>"${old_stdout}" 2>"${old_stderr}"
    /usr/bin/printf '%s\n' "$?" > "${old_status}"
  )
fi
pipeline_status="$?"
set -e

if [[ "${pipeline_status}" -ne 0 || "$(<"${old_status}")" != "0" || "$(<"${new_status}")" != "0" ]]; then
  echo "the Safe Storage binary pipeline failed; inspect the private per-side logs" >&2
  exit 70
fi
exit 0
