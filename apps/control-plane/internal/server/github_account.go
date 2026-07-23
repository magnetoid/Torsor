package server

// ghAction is the account resolution outcome for a GitHub login callback.
type ghAction int

const (
	ghUseUser      ghAction = iota // an existing user_identities row matched
	ghLinkExisting                 // no identity, but a verified email matched a user
	ghSignup                       // no match; create a new account (allow_signup on)
	ghDenied                       // no match and signups disabled
)

// decideGitHubAccount picks the outcome given the results of the two DB lookups
// (identity match, verified-email match) and the allow_signup flag. Pure — no I/O.
func decideGitHubAccount(identityUserID, emailUserID string, allowSignup bool) (ghAction, string) {
	if identityUserID != "" {
		return ghUseUser, identityUserID
	}
	if emailUserID != "" {
		return ghLinkExisting, emailUserID
	}
	if allowSignup {
		return ghSignup, ""
	}
	return ghDenied, ""
}
