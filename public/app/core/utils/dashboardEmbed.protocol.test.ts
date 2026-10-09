jest.mock('@grafana/data', () => ({ toIconName: (value: string) => value }));

it('uses the selected host protocol while enforcing the parent window and origin', () => {
  const previous = {
    property: process.env.GRAFANA_EMBED_RUNTIME_PROPERTY,
    message: process.env.GRAFANA_EMBED_RUNTIME_MESSAGE_TYPE,
  };
  process.env.GRAFANA_EMBED_RUNTIME_PROPERTY = '__exampleEmbedRuntime';
  process.env.GRAFANA_EMBED_RUNTIME_MESSAGE_TYPE = 'example:runtime:update';
  const hostWindow = window as unknown as Record<string, unknown>;
  hostWindow.__exampleEmbedRuntime = { mode: 'dashboardEmbed', parentOrigin: window.location.origin };
  const addListener = jest.spyOn(window, 'addEventListener');

  try {
    jest.isolateModules(() => {
      const { getGrafanaRuntimeLanguage, isDashboardEmbed } = require('./dashboardEmbed');
      expect(isDashboardEmbed()).toBe(true);

      const send = (type: string, origin = window.location.origin, source: MessageEventSource | null = window.parent) =>
        window.dispatchEvent(
          new MessageEvent('message', { origin, source, data: { type, runtime: { language: 'sv-SE' } } })
        );

      send('grafana:runtime:update');
      send('example:runtime:update', 'https://untrusted.example');
      send('example:runtime:update', window.location.origin, null);
      expect(getGrafanaRuntimeLanguage()).toBeUndefined();

      send('example:runtime:update');
      expect(getGrafanaRuntimeLanguage()).toBe('sv-SE');
      expect(window.__grafanaEmbedRuntime).toBeUndefined();
    });
  } finally {
    for (const [type, listener] of addListener.mock.calls) {
      if (type === 'message') {
        window.removeEventListener(type, listener);
      }
    }
    addListener.mockRestore();
    delete hostWindow.__exampleEmbedRuntime;
    if (previous.property === undefined) {
      delete process.env.GRAFANA_EMBED_RUNTIME_PROPERTY;
    } else {
      process.env.GRAFANA_EMBED_RUNTIME_PROPERTY = previous.property;
    }
    if (previous.message === undefined) {
      delete process.env.GRAFANA_EMBED_RUNTIME_MESSAGE_TYPE;
    } else {
      process.env.GRAFANA_EMBED_RUNTIME_MESSAGE_TYPE = previous.message;
    }
  }
});
