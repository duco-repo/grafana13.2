import { toIconName, type IconName } from '@grafana/data';
import { type DashboardMeta } from 'app/types/dashboard';

type DucoGrafanaEmbedMode = 'dashboardEmbed' | 'alertingEmbed';

export interface DucoPanelMenuItem {
  id?: string;
  icon?: IconName;
  label: string;
  action: string;
}

interface DucoGrafanaRuntime {
  mode?: DucoGrafanaEmbedMode;
  dashboardEmbed?: boolean;
  alertingEmbed?: boolean;
  language?: string;
  parentOrigin?: string;
  panelMenuItems?: DucoPanelMenuItem[];
}

interface DucoPanelMenuActionContext {
  dashboardUid?: string;
  dashboardTitle?: string;
  panelId?: number | string;
  panelTitle?: string;
  panelType?: string;
}

declare global {
  interface Window {
    __ducoGrafanaRuntime?: DucoGrafanaRuntime;
  }
}

const RUNTIME_UPDATE_MESSAGE_TYPE = 'duco:grafana-runtime:update';
const PANEL_MENU_ACTION_MESSAGE_TYPE = 'duco:grafana-panel-menu-action';
const MAX_PANEL_MENU_ITEMS = 12;
const MAX_LANGUAGE_LENGTH = 64;
const MAX_ORIGIN_LENGTH = 2048;
const MAX_MENU_LABEL_LENGTH = 120;
const MAX_MENU_ACTION_LENGTH = 128;
const DEFAULT_DASHBOARD_PANEL_MENU_ITEMS: DucoPanelMenuItem[] = [
  {
    id: 'deepdiveData',
    icon: 'search',
    label: 'Deepdive data',
    action: 'deepdiveData',
  },
];

let runtimeMessageListenerRegistered = false;

export function registerDucoGrafanaRuntimeMessageListener(): void {
  if (typeof window === 'undefined' || runtimeMessageListenerRegistered) {
    return;
  }

  runtimeMessageListenerRegistered = true;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!isRecord(data) || data.type !== RUNTIME_UPDATE_MESSAGE_TYPE || !isTrustedParentMessage(event)) {
      return;
    }

    const currentRuntime = getDucoGrafanaRuntime();
    if (!currentRuntime || !isDucoGrafanaEmbed()) {
      return;
    }

    window.__ducoGrafanaRuntime = Object.freeze({
      ...currentRuntime,
      ...sanitizeRuntime(data.runtime),
    });
  });
}

export function isDucoGrafanaEmbed(): boolean {
  return isDucoDashboardEmbed() || isDucoAlertingEmbed();
}

export function isDucoDashboardEmbed(): boolean {
  const runtime = getDucoGrafanaRuntime();
  return runtime?.dashboardEmbed === true || runtime?.mode === 'dashboardEmbed';
}

export function isDucoAlertingEmbed(): boolean {
  const runtime = getDucoGrafanaRuntime();
  return runtime?.alertingEmbed === true || runtime?.mode === 'alertingEmbed';
}

export function getDucoGrafanaRuntimeLanguage(): string | undefined {
  return normalizeLanguage(getDucoGrafanaRuntime()?.language) ?? getDucoGrafanaUrlLanguage();
}

export function getDucoDashboardPanelMenuItems(): DucoPanelMenuItem[] {
  if (!isDucoDashboardEmbed()) {
    return [];
  }

  const configuredItems = getDucoGrafanaRuntime()?.panelMenuItems;
  return configuredItems === undefined
    ? DEFAULT_DASHBOARD_PANEL_MENU_ITEMS.map((item) => ({ ...item }))
    : sanitizePanelMenuItems(configuredItems);
}

export function emitDucoPanelMenuAction(item: DucoPanelMenuItem, context: DucoPanelMenuActionContext): void {
  if (typeof window === 'undefined' || window.parent === window) {
    return;
  }

  window.parent.postMessage(
    {
      type: PANEL_MENU_ACTION_MESSAGE_TYPE,
      action: item.action,
      item,
      context,
    },
    getTrustedParentOrigin()
  );
}

export function getDucoDashboardEmbedMeta(meta: DashboardMeta | undefined): DashboardMeta | undefined {
  if (!isDucoDashboardEmbed() || !meta) {
    return meta;
  }

  return {
    ...meta,
    isEmbedded: true,
    canEdit: false,
    canMakeEditable: false,
    canSave: false,
    canShare: false,
    canStar: false,
    showSettings: false,
  };
}

function getDucoGrafanaRuntime(): DucoGrafanaRuntime | undefined {
  return typeof window === 'undefined' ? undefined : window.__ducoGrafanaRuntime;
}

function getTrustedParentOrigin(): string {
  const configuredOrigin = normalizeOrigin(getDucoGrafanaRuntime()?.parentOrigin);
  return configuredOrigin ?? (typeof window === 'undefined' ? '' : window.location.origin);
}

function isTrustedParentMessage(event: MessageEvent): boolean {
  return event.source === window.parent && event.origin === getTrustedParentOrigin();
}

function sanitizeRuntime(value: unknown): DucoGrafanaRuntime {
  if (!isRecord(value)) {
    return {};
  }

  const mode = value.mode === 'dashboardEmbed' || value.mode === 'alertingEmbed' ? value.mode : undefined;
  const language = normalizeLanguage(value.language);
  const parentOrigin = normalizeOrigin(value.parentOrigin);
  const panelMenuItems = sanitizePanelMenuItems(value.panelMenuItems);
  const hasPanelMenuItems = Array.isArray(value.panelMenuItems);

  return {
    ...(mode ? { mode } : {}),
    ...(mode
      ? { dashboardEmbed: mode === 'dashboardEmbed', alertingEmbed: mode === 'alertingEmbed' }
      : {
          ...(typeof value.dashboardEmbed === 'boolean' ? { dashboardEmbed: value.dashboardEmbed } : {}),
          ...(typeof value.alertingEmbed === 'boolean' ? { alertingEmbed: value.alertingEmbed } : {}),
        }),
    ...(language ? { language } : {}),
    ...(parentOrigin ? { parentOrigin } : {}),
    ...(hasPanelMenuItems ? { panelMenuItems } : {}),
  };
}

function sanitizePanelMenuItems(value: unknown): DucoPanelMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, MAX_PANEL_MENU_ITEMS).reduce<DucoPanelMenuItem[]>((items, rawItem) => {
    if (!isRecord(rawItem)) {
      return items;
    }

    const label = normalizeString(rawItem.label, MAX_MENU_LABEL_LENGTH);
    const action = normalizeString(rawItem.action, MAX_MENU_ACTION_LENGTH);
    if (!label || !action) {
      return items;
    }

    items.push({
      id: normalizeString(rawItem.id, MAX_MENU_ACTION_LENGTH) || action,
      icon: toIconName(normalizeString(rawItem.icon)) ?? 'external-link-alt',
      label,
      action,
    });
    return items;
  }, []);
}

function getDucoGrafanaUrlLanguage(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return normalizeLanguage(new URLSearchParams(window.location.search).get('lang'));
}

function normalizeLanguage(value: unknown): string | undefined {
  const language = normalizeString(value, MAX_LANGUAGE_LENGTH);
  if (!language || !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)) {
    return undefined;
  }

  return language;
}

function normalizeOrigin(value: unknown): string | undefined {
  const origin = normalizeString(value, MAX_ORIGIN_LENGTH);
  if (!origin) {
    return undefined;
  }

  try {
    const url = new URL(origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function normalizeString(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

registerDucoGrafanaRuntimeMessageListener();
