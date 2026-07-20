package textsafe

import "testing"

func TestSanitizeCleanTextUntouched(t *testing.T) {
	in := "Always validate forms with Zod. 日本語 emoji ok"
	out, removed := Sanitize(in)
	if out != in || removed != 0 {
		t.Errorf("clean text must pass through unchanged (removed=%d)", removed)
	}
}

func TestSanitizeStripsHiddenInstructionChannel(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"zero-width space", "run\u200B this", "run this"},
		{"zero-width joiner smuggle", "cl\u200Dean", "clean"},
		{"RTL override", "file\u202Etxt.exe", "filetxt.exe"},
		{"bidi isolates", "\u2066hidden\u2069", "hidden"},
		{"BOM", "\uFEFFtop", "top"},
		{"tag block ascii smuggling", "hi\U000E0068\U000E0069there", "hithere"},
	}
	for _, c := range cases {
		out, removed := Sanitize(c.in)
		if out != c.want || removed == 0 {
			t.Errorf("%s: Sanitize(%q) = %q (removed=%d), want %q", c.name, c.in, out, removed, c.want)
		}
	}
}

// The canonical attack shape: an instruction that reads innocently but carries an
// invisible payload spread through it (5 zero-width spaces here).
func TestSanitizeRulesFileBackdoorShape(t *testing.T) {
	z := "\u200B"
	hidden := "use" + z + z + "the" + z + "backdoor" + z + z
	out, removed := Sanitize("Prefer tabs. " + hidden)
	if removed != 5 {
		t.Errorf("removed = %d, want 5", removed)
	}
	if out != "Prefer tabs. usethebackdoor" {
		t.Errorf("out = %q", out)
	}
}
