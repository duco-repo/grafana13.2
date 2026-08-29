import { memo } from 'react';

import { type LinkTarget } from '@grafana/data';
import { t } from '@grafana/i18n';
import { type IconName } from '@grafana/ui';

export interface FooterLink {
  target: LinkTarget;
  text: string;
  id: string;
  icon?: IconName;
  url?: string;
}

export let getFooterLinks = (): FooterLink[] => {
  return [
    {
      target: '_blank',
      id: 'documentation',
      text: t('nav.help/documentation', 'Documentation'),
      icon: 'document-info',
      url: 'https://grafana.com/docs/grafana/latest/?utm_source=grafana_footer',
    },
    {
      target: '_blank',
      id: 'support',
      text: t('nav.help/support', 'Support'),
      icon: 'question-circle',
      url: 'https://grafana.com/products/enterprise/?utm_source=grafana_footer',
    },
    {
      target: '_blank',
      id: 'community',
      text: t('nav.help/community', 'Community'),
      icon: 'comments-alt',
      url: 'https://community.grafana.com/?utm_source=grafana_footer',
    },
  ];
};

export function setFooterLinksFn(fn: typeof getFooterLinks) {
  getFooterLinks = fn;
}

export interface Props {
  /** Link overrides to show specific links in the UI */
  customLinks?: FooterLink[] | null;
  hideEdition?: boolean;
}

export const Footer = memo((_props: Props) => null);

Footer.displayName = 'Footer';
