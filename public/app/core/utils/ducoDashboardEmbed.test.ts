import { type DashboardMeta } from 'app/types/dashboard';

import {
  getDucoDashboardEmbedMeta,
  getDucoDashboardPanelMenuItems,
  getDucoGrafanaRuntimeLanguage,
  isDucoAlertingEmbed,
  isDucoDashboardEmbed,
  isDucoGrafanaEmbed,
} from './ducoDashboardEmbed';

const RUNTIME_UPDATE_MESSAGE_TYPE = 'duco:grafana-runtime:update';

function setRuntime(runtime?: Record<string, unknown>) {
  const ducoWindow = window as unknown as { __ducoGrafanaRuntime?: unknown };
  if (runtime) {
    ducoWindow.__ducoGrafanaRuntime = runtime;
  } else {
    delete ducoWindow.__ducoGrafanaRuntime;
  }
}

function postRuntimeUpdate(
  origin: string,
  runtime: Record<string, unknown>,
  source: MessageEventSource | null = window.parent
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin,
      source,
      data: { type: RUNTIME_UPDATE_MESSAGE_TYPE, runtime },
    })
  );
}

describe('Duco Grafana embed runtime', () => {
  beforeEach(() => {
    setRuntime();
    window.history.replaceState(null, '', '/');
  });

  afterAll(() => {
    setRuntime();
  });

  it('distinguishes dashboard and alerting embed modes', () => {
    expect(isDucoGrafanaEmbed()).toBe(false);

    setRuntime({ mode: 'dashboardEmbed' });
    expect(isDucoDashboardEmbed()).toBe(true);
    expect(isDucoAlertingEmbed()).toBe(false);

    setRuntime({ alertingEmbed: true });
    expect(isDucoDashboardEmbed()).toBe(false);
    expect(isDucoAlertingEmbed()).toBe(true);
    expect(isDucoGrafanaEmbed()).toBe(true);
  });

  it('forces embedded dashboards into a read-only metadata contract', () => {
    setRuntime({ dashboardEmbed: true });
    const meta = {
      canEdit: true,
      canMakeEditable: true,
      canSave: true,
      canShare: true,
      canStar: true,
      showSettings: true,
    } as DashboardMeta;

    expect(getDucoDashboardEmbedMeta(meta)).toEqual(
      expect.objectContaining({
        isEmbedded: true,
        canEdit: false,
        canMakeEditable: false,
        canSave: false,
        canShare: false,
        canStar: false,
        showSettings: false,
      })
    );
  });

  it('retains the established panel action for older Studio bootstrap payloads', () => {
    setRuntime({ mode: 'dashboardEmbed' });

    expect(getDucoDashboardPanelMenuItems()).toEqual([
      { id: 'deepdiveData', label: 'Deepdive data', action: 'deepdiveData', icon: 'search' },
    ]);

    setRuntime({ mode: 'dashboardEmbed', panelMenuItems: [] });
    expect(getDucoDashboardPanelMenuItems()).toEqual([]);
  });

  it('accepts sanitized runtime updates only from the configured parent origin', () => {
    setRuntime({ mode: 'dashboardEmbed', parentOrigin: window.location.origin });

    postRuntimeUpdate('https://untrusted.example', { language: 'sv-SE' });
    expect(getDucoGrafanaRuntimeLanguage()).toBeUndefined();

    postRuntimeUpdate(window.location.origin, { language: 'sv-SE' }, null);
    expect(getDucoGrafanaRuntimeLanguage()).toBeUndefined();

    postRuntimeUpdate(window.location.origin, {
      language: ' sv-SE ',
      panelMenuItems: [
        { label: ' Deepdive data ', action: ' deepdiveData ', icon: 'search' },
        { label: 'Missing action' },
        { label: 'Fallback icon', action: 'fallbackIcon', icon: 'not-a-grafana-icon' },
      ],
    });

    expect(getDucoGrafanaRuntimeLanguage()).toBe('sv-SE');
    expect(getDucoDashboardPanelMenuItems()).toEqual([
      { id: 'deepdiveData', label: 'Deepdive data', action: 'deepdiveData', icon: 'search' },
      { id: 'fallbackIcon', label: 'Fallback icon', action: 'fallbackIcon', icon: 'external-link-alt' },
    ]);

    postRuntimeUpdate(window.location.origin, { panelMenuItems: [] });
    expect(getDucoDashboardPanelMenuItems()).toEqual([]);

    postRuntimeUpdate(window.location.origin, { mode: 'alertingEmbed', parentOrigin: 'javascript:alert(1)' });
    expect(isDucoDashboardEmbed()).toBe(false);
    expect(isDucoAlertingEmbed()).toBe(true);

    postRuntimeUpdate(window.location.origin, { language: 'en-US' });
    expect(getDucoGrafanaRuntimeLanguage()).toBe('en-US');
  });

  it('falls back to a valid URL language and rejects malformed values', () => {
    window.history.replaceState(null, '', '/?lang=zh-Hans');
    expect(getDucoGrafanaRuntimeLanguage()).toBe('zh-Hans');

    window.history.replaceState(null, '', '/?lang=%3Cscript%3E');
    expect(getDucoGrafanaRuntimeLanguage()).toBeUndefined();
  });
});
