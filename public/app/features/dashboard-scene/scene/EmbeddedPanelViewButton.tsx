import { t } from '@grafana/i18n';
import { locationService } from '@grafana/runtime';
import { type SceneComponentProps, SceneObjectBase, type SceneObjectState, VizPanel } from '@grafana/scenes';
import { Button } from '@grafana/ui';

import { getDashboardSceneFor } from '../utils/utils';

export class EmbeddedPanelViewButton extends SceneObjectBase<SceneObjectState> {
  static Component = EmbeddedPanelViewButtonRenderer;
}

function EmbeddedPanelViewButtonRenderer({ model }: SceneComponentProps<EmbeddedPanelViewButton>) {
  const panel = model.parent;
  if (!(panel instanceof VizPanel)) {
    throw new Error('EmbeddedPanelViewButton must be a child of a VizPanel');
  }
  const dashboard = getDashboardSceneFor(panel);
  const { viewPanel } = dashboard.useState();
  // Numeric IDs are still accepted by Grafana's native view-panel URL handling.
  const expanded = viewPanel === panel.getPathId() || (Boolean(viewPanel) && panel.state.key === `panel-${viewPanel}`);
  const label = expanded
    ? t('dashboard.panel-header.restore', 'Restore panel')
    : t('dashboard.panel-header.expand', 'Expand panel');

  return (
    <Button
      className="show-on-hover"
      icon={<PanelViewIcon expanded={expanded} />}
      variant="secondary"
      fill="text"
      size="sm"
      aria-label={label}
      aria-pressed={expanded}
      title={label}
      onClick={() =>
        locationService.partial({ viewPanel: expanded ? undefined : panel.getPathId(), editPanel: undefined })
      }
    />
  );
}

function PanelViewIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  // Lucide Contributors: https://github.com/lucide-icons/lucide/blob/main/LICENSE
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d={expanded ? 'm14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6' : 'M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6'}
      />
    </svg>
  );
}
