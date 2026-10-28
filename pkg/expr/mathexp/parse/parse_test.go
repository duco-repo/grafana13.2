package parse

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseNestingLimit(t *testing.T) {
	funcs := map[string]Func{"abs": {Args: []ReturnType{TypeScalar}, Return: TypeScalar}}
	for _, form := range []struct {
		name, prefix, suffix string
	}{
		{"parentheses", "(", ")"},
		{"negation", "- ", ""},
		{"logical not", "! ", ""},
		{"function calls", "abs(", ")"},
	} {
		t.Run(form.name, func(t *testing.T) {
			expression := strings.Repeat(form.prefix, 100) + "1" + strings.Repeat(form.suffix, 100)
			tree, err := Parse(expression, funcs)
			require.NoError(t, err)
			require.Equal(t, TypeScalar, tree.Root.Return())

			tree, err = Parse(form.prefix+expression+form.suffix, funcs)
			require.ErrorContains(t, err, "maximum nesting depth")
			require.Nil(t, tree.Root)
		})
	}

	t.Run("mixed nesting shares the limit", func(t *testing.T) {
		_, err := Parse(strings.Repeat("(-abs(", 34)+"1"+strings.Repeat("))", 34), funcs)
		require.ErrorContains(t, err, "maximum nesting depth")
	})

	t.Run("sibling groups do not accumulate depth", func(t *testing.T) {
		_, err := Parse(strings.Repeat("(1) + ", 150) + "-$A")
		require.NoError(t, err)
	})
}
