package setting

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gopkg.in/ini.v1"
)

func TestReadQueryTimeRange(t *testing.T) {
	for _, tc := range []struct {
		name, value string
		want        time.Duration
		invalid     bool
	}{
		{name: "unset disables limit"},
		{name: "zero disables limit", value: "0"},
		{name: "full leap year", value: "8784h", want: 366 * 24 * time.Hour},
		{name: "negative rejected", value: "-1h", invalid: true},
		{name: "invalid unit rejected", value: "1year", invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := NewCfg()
			var err error
			cfg.Raw, err = ini.Load([]byte("[query]\nmax_time_range = " + tc.value))
			require.NoError(t, err)
			err = cfg.readQueryTimeRange()
			if tc.invalid {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tc.want, cfg.QueryMaxTimeRange)
			}
		})
	}
}

func TestQueryTimeRangeEnvironmentOverride(t *testing.T) {
	t.Setenv("GF_QUERY_MAX_TIME_RANGE", "24h")
	cfg := NewCfg()
	var err error
	cfg.Raw, err = ini.Load([]byte("[query]\nmax_time_range = 8784h"))
	require.NoError(t, err)
	require.NoError(t, cfg.readQueryTimeRange())
	require.Equal(t, 24*time.Hour, cfg.QueryMaxTimeRange)
}
