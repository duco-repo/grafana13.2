#!/usr/bin/env bash

set -euo pipefail

lock_file="${1:?plugin lock path is required}"
destination="${2:?plugin destination is required}"
expected_lock_sha256="${3:-}"

if [[ ! -f "${lock_file}" ]]; then
  echo "Plugin lock does not exist: ${lock_file}" >&2
  exit 1
fi

actual_lock_sha256="$(sha256sum "${lock_file}" | awk '{print $1}')"
if [[ -n "${expected_lock_sha256}" && "${actual_lock_sha256}" != "${expected_lock_sha256}" ]]; then
  echo "Plugin lock SHA-256 mismatch" >&2
  exit 1
fi

mkdir -p "${destination}"
if find "${destination}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "Plugin destination must be empty before installing the locked inventory: ${destination}" >&2
  exit 1
fi

declare -A expected_versions=()
plugin_count=0

while read -r plugin_id plugin_version extra; do
  if [[ -z "${plugin_id:-}" || "${plugin_id}" == \#* ]]; then
    continue
  fi

  if [[ -z "${plugin_version:-}" || -n "${extra:-}" ]]; then
    echo "Invalid plugin lock entry: ${plugin_id} ${plugin_version:-} ${extra:-}" >&2
    exit 1
  fi
  if [[ ! "${plugin_id}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "Invalid plugin ID: ${plugin_id}" >&2
    exit 1
  fi
  if [[ ! "${plugin_version}" =~ ^[0-9]+(\.[0-9]+){2}([.+-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid plugin version for ${plugin_id}: ${plugin_version}" >&2
    exit 1
  fi
  if [[ -n "${expected_versions[${plugin_id}]+x}" ]]; then
    echo "Duplicate plugin ID in lock: ${plugin_id}" >&2
    exit 1
  fi

  expected_versions["${plugin_id}"]="${plugin_version}"
  plugin_count=$((plugin_count + 1))
  grafana cli --pluginsDir "${destination}" plugins install "${plugin_id}" "${plugin_version}"
done < "${lock_file}"

if [[ "${plugin_count}" -eq 0 ]]; then
  echo "Plugin lock is empty" >&2
  exit 1
fi

installed_plugins="$(grafana cli --pluginsDir "${destination}" plugins ls)"
actual_count="$(printf '%s\n' "${installed_plugins}" | grep -c ' @ ' || true)"
if [[ "${actual_count}" -ne "${plugin_count}" ]]; then
  echo "Expected ${plugin_count} locked plugins, found ${actual_count}" >&2
  printf '%s\n' "${installed_plugins}" >&2
  exit 1
fi

for plugin_id in "${!expected_versions[@]}"; do
  expected_line="${plugin_id} @ ${expected_versions[${plugin_id}]}"
  if ! grep -Fqx "${expected_line}" <<< "${installed_plugins}"; then
    echo "Installed plugin inventory is missing: ${expected_line}" >&2
    printf '%s\n' "${installed_plugins}" >&2
    exit 1
  fi
done

printf '%s  %s\n' "${actual_lock_sha256}" "$(basename "${lock_file}")" > "${lock_file}.sha256"
printf '%s\n' "${installed_plugins}"
