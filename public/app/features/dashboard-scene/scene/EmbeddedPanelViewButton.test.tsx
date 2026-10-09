import { act, fireEvent, render, screen } from '@testing-library/react';

import { locationService } from '@grafana/runtime';
import { defaultPanelSpec } from '@grafana/schema/apis/dashboard.grafana.app/v2';
import { PanelModel } from 'app/features/dashboard/state/PanelModel';

import { buildVizPanel } from '../serialization/layoutSerializers/utils';
import { buildGridItemForPanel } from '../serialization/transformSaveModelToScene';

import { DashboardScene } from './DashboardScene';
import { EmbeddedPanelViewButton } from './EmbeddedPanelViewButton';
import { DefaultGridLayoutManager } from './layout-default/DefaultGridLayoutManager';

const builders = {
  v1: () => buildGridItemForPanel(new PanelModel({ id: 12, type: 'timeseries', title: 'Engine speed' })).state.body,
  v2: () => buildVizPanel({ kind: 'Panel', spec: { ...defaultPanelSpec(), id: 12, title: 'Engine speed' } }),
};

afterEach(() => {
  delete window.__grafanaEmbedRuntime;
});

describe.each(Object.entries(builders))('embedded panel control (%s)', (_version, build) => {
  it.each([undefined, 'alertingEmbed'] as const)(
    'preserves the normal menu outside dashboard embed mode: %s',
    (mode) => {
      window.__grafanaEmbedRuntime = mode ? { mode } : undefined;
      const panel = build();
      expect(panel.state.menu).toBeDefined();
      expect(panel.state.headerActions).not.toBeInstanceOf(EmbeddedPanelViewButton);
    }
  );

  it('replaces the menu with a direct expand/restore button and retains current filters', () => {
    window.__grafanaEmbedRuntime = { mode: 'dashboardEmbed' };
    const panel = build();
    expect(panel.state.menu).toBeUndefined();
    expect(panel.state.headerActions).toBeInstanceOf(EmbeddedPanelViewButton);
    const model = panel.state.headerActions as EmbeddedPanelViewButton;
    const dashboard = new DashboardScene({
      title: 'Dashboard',
      uid: 'dashboard-a',
      meta: {},
      body: DefaultGridLayoutManager.fromVizPanels([panel]),
    });
    locationService.push('/d/dashboard-a?from=now-6h&to=now&var-fields=speed&orgId=2&var-access=fixture&editPanel=12');
    render(<model.Component model={model} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const expanded = new URLSearchParams(locationService.getLocation().search);
    expect(expanded.get('viewPanel')).toBe(panel.getPathId());
    expect(expanded.has('editPanel')).toBe(false);
    expect(expanded.get('var-fields')).toBe('speed');
    expect(expanded.get('from')).toBe('now-6h');
    expect(expanded.get('orgId')).toBe('2');
    expect(expanded.get('var-access')).toBe('fixture');

    act(() => dashboard.setState({ viewPanel: panel.getPathId() }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore panel' }));
    const restored = new URLSearchParams(locationService.getLocation().search);
    expect(restored.has('viewPanel')).toBe(false);
    expect(restored.get('var-fields')).toBe('speed');
    expect(restored.get('var-access')).toBe('fixture');
  });
});
