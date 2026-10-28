package sso

import (
	"context"
	"errors"
	"testing"

	authlib "github.com/grafana/authlib/types"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace/noop"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apiserver/pkg/registry/rest"

	"github.com/grafana/grafana/pkg/apimachinery/identity"
	iamv0 "github.com/grafana/grafana/pkg/apis/iam/v0alpha1"
	settingsvc "github.com/grafana/grafana/pkg/services/setting"
	ssomodels "github.com/grafana/grafana/pkg/services/ssosettings/models"
	"github.com/grafana/grafana/pkg/setting"
)

type ssoAccessClient struct {
	authlib.AccessClient
	check   func(authlib.CheckRequest) (authlib.CheckResponse, error)
	compile func(authlib.ListRequest) (authlib.ItemChecker, authlib.Zookie, error)
}

func (c *ssoAccessClient) Check(_ context.Context, _ authlib.AuthInfo, req authlib.CheckRequest, _ string) (authlib.CheckResponse, error) {
	return c.check(req)
}

func (c *ssoAccessClient) Compile(_ context.Context, _ authlib.AuthInfo, req authlib.ListRequest) (authlib.ItemChecker, authlib.Zookie, error) {
	return c.compile(req)
}

type listSSOService struct {
	fakeSSOService
	settings []*ssomodels.SSOSettings
}

func (s *listSSOService) List(context.Context) ([]*ssomodels.SSOSettings, error) {
	return s.settings, nil
}

func TestRedactingStoreCreate(t *testing.T) {
	for _, allowed := range []bool{false, true} {
		t.Run(map[bool]string{false: "denied", true: "allowed"}[allowed], func(t *testing.T) {
			svc := &fakeSSOService{}
			checked := false
			client := &ssoAccessClient{check: func(req authlib.CheckRequest) (authlib.CheckResponse, error) {
				checked = true
				require.Equal(t, "create", req.Verb)
				require.Equal(t, "setting.grafana.app", req.Group)
				require.Equal(t, "settings", req.Resource)
				require.Equal(t, "auth.ldap", req.Name)
				require.Equal(t, "stacks-11", req.Namespace)
				return authlib.CheckResponse{Allowed: allowed}, nil
			}}
			storage, err := NewRedactingStore(NewLegacyStore(svc, noop.NewTracerProvider().Tracer("test")), client)
			require.NoError(t, err)
			ctx := identity.WithRequester(nsCtx(), &identity.StaticRequester{Type: authlib.TypeUser})
			obj := ssoObj("ldap", map[string]any{"config": map[string]any{
				"servers": []any{map[string]any{"host": "ldap.example.com", "bind_password": "secret"}},
			}})
			out, err := storage.(rest.Creater).Create(ctx, obj, nil, &metav1.CreateOptions{})
			require.True(t, checked)
			if !allowed {
				require.True(t, apierrors.IsForbidden(err))
				require.Nil(t, out)
				require.Nil(t, svc.upserted)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, svc.upserted)
			want := map[string]any{"config": map[string]any{"servers": []any{
				map[string]any{"host": "ldap.example.com", "bind_password": setting.RedactedPassword},
			}}}
			require.Equal(t, want, out.(*iamv0.SSOSetting).Spec.Settings.Object)
			require.Equal(t, obj.Spec.Settings.Object, svc.upserted.Settings)
			require.Equal(t, "secret", svc.upserted.Settings["config"].(map[string]any)["servers"].([]any)[0].(map[string]any)["bind_password"])
		})
	}
}

func TestRedactingStoreList(t *testing.T) {
	svc := &listSSOService{settings: []*ssomodels.SSOSettings{
		{Provider: "generic_oauth", Settings: map[string]any{"client_secret": "hidden-provider-secret"}},
		{Provider: "github", Settings: map[string]any{"client_id": "github-client", "client_secret": "oauth-secret"}},
		{Provider: "ldap", Settings: map[string]any{"enabled": true, "config": map[string]any{
			"servers": []any{map[string]any{"host": "ldap.example.com", "port": int64(389), "bind_password": "secret"}},
		}}},
	}}
	client := &ssoAccessClient{compile: func(req authlib.ListRequest) (authlib.ItemChecker, authlib.Zookie, error) {
		require.Equal(t, "list", req.Verb)
		require.Equal(t, "setting.grafana.app", req.Group)
		require.Equal(t, "settings", req.Resource)
		require.Equal(t, "stacks-11", req.Namespace)
		return func(name, _ string) bool { return name == "auth.ldap" || name == "auth.github" }, authlib.NoopZookie{}, nil
	}}
	storage, err := NewRedactingStore(NewLegacyStore(svc, noop.NewTracerProvider().Tracer("test")), client)
	require.NoError(t, err)
	ctx := identity.WithRequester(nsCtx(), &identity.StaticRequester{Type: authlib.TypeUser})
	out, err := storage.(rest.Lister).List(ctx, &internalversion.ListOptions{})
	require.NoError(t, err)
	items := out.(*iamv0.SSOSettingList).Items
	require.Len(t, items, 2)
	require.Equal(t, "github", items[0].Name)
	require.Equal(t, map[string]any{"client_id": "github-client", "client_secret": setting.RedactedPassword}, items[0].Spec.Settings.Object)
	require.Equal(t, "ldap", items[1].Name)
	require.Equal(t, map[string]any{"enabled": true, "config": map[string]any{"servers": []any{
		map[string]any{"host": "ldap.example.com", "port": int64(389), "bind_password": setting.RedactedPassword},
	}}}, items[1].Spec.Settings.Object)
	require.Equal(t, "hidden-provider-secret", svc.settings[0].Settings["client_secret"])
	require.Equal(t, map[string]any{"client_id": "github-client", "client_secret": "oauth-secret"}, svc.settings[1].Settings)
	require.Equal(t, map[string]any{"enabled": true, "config": map[string]any{"servers": []any{
		map[string]any{"host": "ldap.example.com", "port": int64(389), "bind_password": "secret"},
	}}}, svc.settings[2].Settings)

	t.Run("authorization failure returns no settings", func(t *testing.T) {
		failure := errors.New("authorization unavailable")
		client.compile = func(authlib.ListRequest) (authlib.ItemChecker, authlib.Zookie, error) {
			return nil, nil, failure
		}
		out, err := storage.(rest.Lister).List(ctx, &internalversion.ListOptions{})
		require.ErrorIs(t, err, failure)
		require.Nil(t, out)
	})
}

func TestMTSettingsStoreReadModifyWritePreservesSecret(t *testing.T) {
	f := newFakeSettings([]*settingsvc.Setting{
		usRow("auth.generic_oauth", "client_id", "original"),
		usRow("auth.generic_oauth", "client_secret", "stored-secret"),
	})
	storage := NewMTSettingsStore(f, f)
	obj, err := storage.Get(nsCtx(), "generic_oauth", &metav1.GetOptions{})
	require.NoError(t, err)
	settings := obj.(*iamv0.SSOSetting).Spec.Settings.Object
	require.Equal(t, setting.RedactedPassword, settings["client_secret"])
	settings["client_id"] = "changed"

	out, created, err := storage.Update(nsCtx(), "generic_oauth", rest.DefaultUpdatedObjectInfo(obj), nil, nil, false, &metav1.UpdateOptions{})
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, "stored-secret", f.us["auth.generic_oauth|client_secret"].Value)
	require.Equal(t, "changed", f.us["auth.generic_oauth|client_id"].Value)
	require.Equal(t, setting.RedactedPassword, out.(*iamv0.SSOSetting).Spec.Settings.Object["client_secret"])
}
