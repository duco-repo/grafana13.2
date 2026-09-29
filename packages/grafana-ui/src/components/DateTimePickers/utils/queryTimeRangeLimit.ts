import { type TimeRange } from '@grafana/data';
import { t } from '@grafana/i18n';

export function getQueryTimeRangeError(range: TimeRange): string | undefined {
  const limit = window?.grafanaBootData?.settings?.queryMaxTimeRangeMs;
  if (limit && limit > 0 && range.to.valueOf() - range.from.valueOf() > limit) {
    return t(
      'time-picker.range-limit.exceeded',
      'Select a time range of at most {{days}} days. Older dates are allowed.',
      { days: limit / 86_400_000 }
    );
  }
  return undefined;
}
