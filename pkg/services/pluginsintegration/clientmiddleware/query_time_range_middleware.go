package clientmiddleware

import (
	"context"
	"fmt"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana/pkg/apimachinery/errutil"
)

func NewQueryTimeRangeMiddleware(limit time.Duration) backend.HandlerMiddleware {
	return backend.HandlerMiddlewareFunc(func(next backend.Handler) backend.Handler {
		return &queryTimeRangeMiddleware{BaseHandler: backend.NewBaseHandler(next), limit: limit}
	})
}

type queryTimeRangeMiddleware struct {
	backend.BaseHandler
	limit time.Duration
}

func (m *queryTimeRangeMiddleware) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	if m.limit > 0 {
		// Validate every resolved query range before either cache lookup or plugin execution.
		// Per-query overrides, expressions and non-browser callers follow the same policy.
		for _, query := range req.Queries {
			if query.TimeRange.To.Before(query.TimeRange.From) {
				return nil, errutil.BadRequest("query.invalidTimeRange",
					errutil.WithPublicMessage("The time range end must not be before its start.")).Errorf("invalid time range for query %s", query.RefID)
			}
			if query.TimeRange.To.Sub(query.TimeRange.From) > m.limit {
				message := fmt.Sprintf("Select a time range of at most %g days. Older dates are allowed.", m.limit.Hours()/24)
				return nil, errutil.BadRequest("query.timeRangeExceeded",
					errutil.WithPublicMessage(message)).Errorf("%s Query: %s", message, query.RefID)
			}
		}
	}
	return m.BaseHandler.QueryData(ctx, req)
}
