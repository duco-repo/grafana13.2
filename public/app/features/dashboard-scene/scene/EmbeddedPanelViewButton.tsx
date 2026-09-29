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
      icon={expanded ? 'compress-arrows' : 'expand-arrows'}
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
