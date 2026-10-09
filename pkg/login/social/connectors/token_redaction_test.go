package connectors

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRawJWTPayloadErrorsDoNotExposeTokens(t *testing.T) {
	social := &SocialBase{}
	for _, token := range []any{
		"private-oauth-token",
		map[string]string{"access_token": "private-oauth-token"},
	} {
		_, err := social.retrieveRawJWTPayload(token)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "private-oauth-token")
	}
}
