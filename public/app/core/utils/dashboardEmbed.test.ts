import { type DashboardMeta } from 'app/types/dashboard';

import {
  getDashboardEmbedMeta,
  getGrafanaRuntimeLanguage,
  isAlertingEmbed,
  isDashboardEmbed,
  isGrafanaEmbed,
} from './dashboardEmbed';

const RUNTIME_UPDATE_MESSAGE_TYPE = 'grafana:runtime:update';

function setRuntime(runtime?: Record<string, unknown>) {
  const embedWindow = window as unknown as { __grafanaEmbedRuntime?: unknown };
  if (runtime) {
    embedWindow.__grafanaEmbedRuntime = runtime;
  } else {
    delete embedWindow.__grafanaEmbedRuntime;
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

describe('Grafana embed runtime', () => {
  beforeEach(() => {
    setRuntime();
    window.history.replaceState(null, '', '/');
  });

  afterAll(() => {
    setRuntime();
  });

  it('distinguishes dashboard and alerting embed modes', () => {
    expect(isGrafanaEmbed()).toBe(false);

    setRuntime({ mode: 'dashboardEmbed' });
    expect(isDashboardEmbed()).toBe(true);
    expect(isAlertingEmbed()).toBe(false);

    setRuntime({ alertingEmbed: true });
    expect(isDashboardEmbed()).toBe(false);
    expect(isAlertingEmbed()).toBe(true);
    expect(isGrafanaEmbed()).toBe(true);
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

    expect(getDashboardEmbedMeta(meta)).toEqual(
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

  it('accepts sanitized runtime updates only from the configured parent origin', () => {
    setRuntime({ mode: 'dashboardEmbed', parentOrigin: window.location.origin });

    postRuntimeUpdate('https://untrusted.example', { language: 'sv-SE' });
    expect(getGrafanaRuntimeLanguage()).toBeUndefined();

    postRuntimeUpdate(window.location.origin, { language: 'sv-SE' }, null);
    expect(getGrafanaRuntimeLanguage()).toBeUndefined();

    postRuntimeUpdate(window.location.origin, {
      language: ' sv-SE ',
    });

    expect(getGrafanaRuntimeLanguage()).toBe('sv-SE');
    postRuntimeUpdate(window.location.origin, { mode: 'alertingEmbed', parentOrigin: 'javascript:alert(1)' });
    expect(isDashboardEmbed()).toBe(false);
    expect(isAlertingEmbed()).toBe(true);

    postRuntimeUpdate(window.location.origin, { language: 'en-US' });
    expect(getGrafanaRuntimeLanguage()).toBe('en-US');
  });

  it('falls back to a valid URL language and rejects malformed values', () => {
    window.history.replaceState(null, '', '/?lang=zh-Hans');
    expect(getGrafanaRuntimeLanguage()).toBe('zh-Hans');

    window.history.replaceState(null, '', '/?lang=%3Cscript%3E');
    expect(getGrafanaRuntimeLanguage()).toBeUndefined();
  });
});
