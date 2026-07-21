package auth

import (
	"testing"
	"time"

	"codress/server/internal/config"
)

func TestJWTRoundtrip(t *testing.T) {
	token, err := IssueToken("secret", 42, RoleUser, "tester", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := ParseToken("secret", token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID() != 42 || claims.Role != RoleUser || claims.Name != "tester" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if _, err := ParseToken("wrong-secret", token); err == nil {
		t.Fatal("expected error with wrong secret")
	}
}

func TestOAuthStateRoundtrip(t *testing.T) {
	oauth := NewOAuth(&config.Config{JWTSecret: "secret"})
	state, err := oauth.SignState(51789)
	if err != nil {
		t.Fatal(err)
	}
	port, err := oauth.VerifyState(state)
	if err != nil {
		t.Fatal(err)
	}
	if port != 51789 {
		t.Fatalf("expected port 51789, got %d", port)
	}
	if _, err := oauth.VerifyState(state + "x"); err == nil {
		t.Fatal("tampered state should fail")
	}
	if _, err := oauth.VerifyState(""); err == nil {
		t.Fatal("empty state should fail")
	}
	// 用另一个密钥签的 state 必须被拒绝
	other := NewOAuth(&config.Config{JWTSecret: "other"})
	foreign, _ := other.SignState(0)
	if _, err := oauth.VerifyState(foreign); err == nil {
		t.Fatal("state signed with another secret should fail")
	}
}
