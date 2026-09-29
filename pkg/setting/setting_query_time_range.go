package setting

import (
	"fmt"
	"time"
)

func (cfg *Cfg) readQueryTimeRange() error {
	raw := cfg.SectionWithEnvOverrides("query").Key("max_time_range").MustString("0")
	limit, err := time.ParseDuration(raw)
	if err != nil || limit < 0 {
		return fmt.Errorf("query.max_time_range must be a non-negative duration, got %q", raw)
	}
	cfg.QueryMaxTimeRange = limit
	return nil
}
