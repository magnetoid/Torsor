// Package textsafe strips invisible Unicode used to smuggle hidden instructions into
// agent-facing text — the "Rules File Backdoor" class of attack (Pillar Security, 2025):
// zero-width characters and bidirectional-control overrides hidden inside rules files,
// skills, memories, or task text are invisible to a human reviewer but fully visible to
// the model. Torsor sanitizes every such surface before it reaches a system prompt.
package textsafe

import "strings"

// invisible reports whether r is an invisible/steering rune with no legitimate place in
// agent instructions: zero-width chars, bidi controls, the Unicode tag block, and other
// invisible format characters. Normal text (all scripts), emoji, and whitespace pass
// through — stripping a ZWJ degrades an emoji sequence visually but never changes
// meaning-bearing text. (Hex constants only in this table: literal runes would be
// invisible in code review — exactly the attack this package defends against.)
func invisible(r rune) bool {
	switch r {
	case 0x200B, // zero width space
		0x200C, // zero width non-joiner
		0x200D, // zero width joiner
		0x200E, // left-to-right mark
		0x200F, // right-to-left mark
		0x2028, // line separator
		0x2029, // paragraph separator
		0x202A, // LTR embedding
		0x202B, // RTL embedding
		0x202C, // pop directional formatting
		0x202D, // LTR override
		0x202E, // RTL override (the classic bidi attack)
		0x2060, // word joiner
		0x2061, // function application (invisible operator)
		0x2062, // invisible times
		0x2063, // invisible separator
		0x2064, // invisible plus
		0x2066, // LTR isolate
		0x2067, // RTL isolate
		0x2068, // first strong isolate
		0x2069, // pop directional isolate
		0xFEFF: // BOM / zero width no-break space
		return true
	}
	// Unicode tag block (U+E0000–U+E007F): invisible ASCII mirror — the highest-capacity
	// hidden-instruction channel ("ASCII smuggling").
	return r >= 0xE0000 && r <= 0xE007F
}

// Sanitize returns s with all invisible steering runes removed, plus how many were
// removed. A non-zero count on config-like input (skills, rules, memories) is a strong
// hidden-instruction signal worth logging.
func Sanitize(s string) (string, int) {
	// Fast path: most text is clean; scan before allocating.
	clean := true
	for _, r := range s {
		if invisible(r) {
			clean = false
			break
		}
	}
	if clean {
		return s, 0
	}
	var b strings.Builder
	b.Grow(len(s))
	removed := 0
	for _, r := range s {
		if invisible(r) {
			removed++
			continue
		}
		b.WriteRune(r)
	}
	return b.String(), removed
}
