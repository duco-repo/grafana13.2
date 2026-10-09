import { css } from '@emotion/css';

import { useStyles2 } from '../../themes/ThemeContext';
import { useBranding } from '../Branding/BrandingContext';

import grafanaIconSvg from './grafana_icon.svg';

export function LoadingLogo() {
  const styles = useStyles2(getStyles);
  const { AppLogo } = useBranding();
  const logo = AppLogo ? <AppLogo /> : <img src={grafanaIconSvg} alt="GF Insight" />;

  return <div className={styles.logo}>{logo}</div>;
}

const getStyles = () => ({
  logo: css({
    textAlign: 'center',
    img: {
      width: '60px',
      height: '60px',
    },
  }),
});
