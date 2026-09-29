# Source container builds

This source distribution is based on Grafana 13.2.1, with applicable 13.2.2
security backports, embedded dashboard controls, and theme adjustments.
The upstream license and copyright notices remain in place.

Build the default Linux image from the repository root using `Dockerfile`.
Pass `COMMIT_SHA`, `BUILD_BRANCH`, and `SOURCE_DATE_EPOCH` for reproducible
version metadata. `PLUGIN_LOCK_SHA256` can enforce the SHA-256 of
`packaging/container/plugins.lock` during installation.

The seven catalog plugins in the lock are installed under
`/usr/share/grafana/data/plugins-bundled`. Their lock and checksum are stored
under `/usr/share/grafana/plugin-lock`. Deployment operators should disable
runtime plugin installation and manage upgrades through reviewed image builds.

## Embedded host integration

The default bootstrap property is `window.__grafanaEmbedRuntime`. It accepts
`mode` (`dashboardEmbed` or `alertingEmbed`), `language`, `parentOrigin`, and
optional `panelMenuItems`. Runtime updates use `grafana:runtime:update`, and
panel actions are posted to the parent as `grafana:panel-menu-action`.
Messages must come from the configured parent window and origin. Embedded
metadata suppresses editing controls; server authorization remains mandatory.

Integrators can select protocol names at build time with these Docker arguments:

- `GRAFANA_EMBED_RUNTIME_PROPERTY`
- `GRAFANA_EMBED_RUNTIME_MESSAGE_TYPE`
- `GRAFANA_EMBED_PANEL_ACTION_MESSAGE_TYPE`

Each build selects one protocol. Keep deployment values, registry credentials,
customer identifiers, and operational evidence outside this public source tree.
