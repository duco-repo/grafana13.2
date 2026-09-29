package clientmiddleware

import (
	"context"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/handlertest"
	"github.com/stretchr/testify/require"
)

func TestQueryTimeRangeMiddleware(t *testing.T) {
	const year = 366 * 24 * time.Hour
	from := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name            string
		limit, duration time.Duration
		blocked         bool
	}{
		{name: "historical month", limit: year, duration: 31 * 24 * time.Hour},
		{name: "historical full leap year", limit: year, duration: year},
		{name: "one millisecond over", limit: year, duration: year + time.Millisecond, blocked: true},
		{name: "reversed range", limit: year, duration: -time.Hour, blocked: true},
		{name: "instant query", limit: year},
		{name: "disabled", duration: 3 * year},
	} {
		for _, role := range []string{"Viewer", "Editor", "Admin", ""} {
			t.Run(tc.name+"/"+role, func(t *testing.T) {
				cdt := handlertest.NewHandlerMiddlewareTest(t, handlertest.WithMiddlewares(NewQueryTimeRangeMiddleware(tc.limit)))
				called := false
				cdt.TestHandler.QueryDataFunc = func(_ context.Context, _ *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
					called = true
					return &backend.QueryDataResponse{}, nil
				}
				req := &backend.QueryDataRequest{
					PluginContext: backend.PluginContext{User: &backend.User{Role: role}},
					Queries: []backend.DataQuery{
						{RefID: "A", TimeRange: backend.TimeRange{From: from, To: from.Add(time.Hour)}},
						{RefID: "B", TimeRange: backend.TimeRange{From: from, To: from.Add(tc.duration)}},
					},
				}
				// Internal/service callers do not necessarily carry a user.
				if role == "" {
					req.PluginContext.User = nil
				}
				_, err := cdt.MiddlewareHandler.QueryData(context.Background(), req)
				if tc.blocked {
					require.Error(t, err)
					require.False(t, called, "no query in an invalid batch may reach the datasource")
				} else {
					require.NoError(t, err)
					require.True(t, called)
				}
			})
		}
	}
}
