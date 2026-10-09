package clients

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	claims "github.com/grafana/authlib/types"
	"github.com/grafana/grafana/pkg/infra/tracing"
	"github.com/grafana/grafana/pkg/services/authn"
	"github.com/grafana/grafana/pkg/services/authn/authntest"
	"github.com/grafana/grafana/pkg/setting"
)

func TestProxyCacheKeyIdentityBoundaries(t *testing.T) {
	tests := []struct {
		name        string
		username    string
		additional  map[string]string
		otherUser   string
		otherFields map[string]string
	}{
		{"username and name", "admin", map[string]string{proxyFieldName: "user"}, "ad", map[string]string{proxyFieldName: "minuser"}},
		{"adjacent attributes", "user", map[string]string{proxyFieldName: "ab", proxyFieldEmail: "c"}, "user", map[string]string{proxyFieldName: "a", proxyFieldEmail: "bc"}},
		{"different field", "user", map[string]string{proxyFieldName: "value"}, "user", map[string]string{proxyFieldEmail: "value"}},
		{"embedded delimiters", "user:a", map[string]string{proxyFieldName: "b"}, "user", map[string]string{proxyFieldName: "a:b"}},
		{"escaped values", "user", map[string]string{proxyFieldName: "a\",\"b", proxyFieldEmail: "c"}, "user", map[string]string{proxyFieldName: "a", proxyFieldEmail: "b\",\"c"}},
		{"non-UTF8 header bytes", "user", map[string]string{proxyFieldName: "\xff"}, "user", map[string]string{proxyFieldName: "\xfe"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, ok := getProxyCacheKey(tt.username, tt.additional)
			require.True(t, ok)
			other, ok := getProxyCacheKey(tt.otherUser, tt.otherFields)
			require.True(t, ok)
			require.NotEqual(t, key, other)
		})
	}

	t.Run("map insertion order does not change identity", func(t *testing.T) {
		first := map[string]string{proxyFieldName: "name", proxyFieldEmail: "email"}
		second := map[string]string{}
		second[proxyFieldEmail] = "email"
		second[proxyFieldName] = "name"
		key, ok := getProxyCacheKey("user", first)
		require.True(t, ok)
		other, ok := getProxyCacheKey("user", second)
		require.True(t, ok)
		require.Equal(t, key, other)
	})

	for _, field := range proxyFields {
		t.Run("changing "+field+" invalidates identity", func(t *testing.T) {
			key, ok := getProxyCacheKey("user", nil)
			require.True(t, ok)
			other, ok := getProxyCacheKey("user", map[string]string{field: "changed"})
			require.True(t, ok)
			require.NotEqual(t, key, other)
		})
	}
}

func TestProxyAuthenticateRejectsCollidingIdentity(t *testing.T) {
	cfg := setting.NewCfg()
	cfg.AuthProxy.HeaderName = "X-Username"
	cfg.AuthProxy.Headers = map[string]string{proxyFieldName: "X-Name"}
	cfg.AuthProxy.SyncTTL = 15

	victimKey, ok := getProxyCacheKey("admin", map[string]string{proxyFieldName: "user"})
	require.True(t, ok)
	cache := &fakeCache{data: map[string][]byte{victimKey: []byte("42")}}
	clientCalls := 0
	proxyClient := authntest.MockProxyClient{AuthenticateProxyFunc: func(_ context.Context, _ *authn.Request, username string, additional map[string]string) (*authn.Identity, error) {
		clientCalls++
		require.Equal(t, "ad", username)
		require.Equal(t, "minuser", additional[proxyFieldName])
		return &authn.Identity{ID: "7", Type: claims.TypeUser}, nil
	}}
	client, err := ProvideProxy(cfg, cache, tracing.InitializeTracerForTest(), proxyClient)
	require.NoError(t, err)

	request := &authn.Request{HTTPRequest: &http.Request{Header: http.Header{
		"X-Username": {"ad"}, "X-Name": {"minuser"},
	}}}
	identity, err := client.Authenticate(t.Context(), request)
	require.NoError(t, err)
	require.Equal(t, "7", identity.ID)
	require.Equal(t, 1, clientCalls)

	request.HTTPRequest.Header.Set("X-Username", "admin")
	request.HTTPRequest.Header.Set("X-Name", "user")
	identity, err = client.Authenticate(t.Context(), request)
	require.NoError(t, err)
	require.Equal(t, "42", identity.ID)
	require.Equal(t, 1, clientCalls)
}
