package iam

import (
	"context"
	"testing"

	"github.com/grafana/authlib/types"
	"github.com/stretchr/testify/require"
	"k8s.io/apiserver/pkg/authorization/authorizer"

	"github.com/grafana/grafana/pkg/apimachinery/identity"
)

func TestSSOSettingAuthorizerProviderPermissions(t *testing.T) {
	for _, verb := range []string{"get", "update", "patch", "delete"} {
		t.Run(verb, func(t *testing.T) {
			for _, allowed := range []bool{false, true} {
				checked := false
				client := &fakeAccessClient{checkFunc: func(_ context.Context, _ types.AuthInfo, req types.CheckRequest, _ string) (types.CheckResponse, error) {
					checked = true
					require.Equal(t, verb, req.Verb)
					require.Equal(t, "setting.grafana.app", req.Group)
					require.Equal(t, "settings", req.Resource)
					require.Equal(t, "auth.generic_oauth", req.Name)
					require.Equal(t, "org-1", req.Namespace)
					return types.CheckResponse{Allowed: allowed}, nil
				}}
				ctx := identity.WithRequester(context.Background(), &identity.StaticRequester{Type: types.TypeUser})
				decision, _, err := newSSOSettingAuthorizer(client).Authorize(ctx, authorizer.AttributesRecord{
					ResourceRequest: true, APIGroup: "iam.grafana.app", Resource: "ssosettings",
					Name: "generic_oauth", Verb: verb, Namespace: "org-1",
				})
				require.NoError(t, err)
				require.True(t, checked)
				want := authorizer.DecisionDeny
				if allowed {
					want = authorizer.DecisionAllow
				}
				require.Equal(t, want, decision)
			}
		})
	}
}

func TestSSOSettingAuthorizerCollectionIdentity(t *testing.T) {
	for _, verb := range []string{"list", "create"} {
		t.Run(verb, func(t *testing.T) {
			for _, tc := range []struct {
				name string
				ctx  context.Context
				want authorizer.Decision
			}{
				{"missing identity", context.Background(), authorizer.DecisionDeny},
				{"anonymous", identity.WithRequester(context.Background(), &identity.StaticRequester{Type: types.TypeAnonymous}), authorizer.DecisionDeny},
				{"authenticated", identity.WithRequester(context.Background(), &identity.StaticRequester{Type: types.TypeUser}), authorizer.DecisionAllow},
			} {
				t.Run(tc.name, func(t *testing.T) {
					client := &fakeAccessClient{checkFunc: func(context.Context, types.AuthInfo, types.CheckRequest, string) (types.CheckResponse, error) {
						t.Fatal("collection authorization must defer provider checks to storage")
						return types.CheckResponse{}, nil
					}}
					decision, _, err := newSSOSettingAuthorizer(client).Authorize(tc.ctx, authorizer.AttributesRecord{
						ResourceRequest: true, Resource: "ssosettings", Verb: verb,
					})
					require.NoError(t, err)
					require.Equal(t, tc.want, decision)
				})
			}
		})
	}
}
