package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"codress/server/internal/config"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/endpoints"
)

const (
	ProviderGithub = "github"
	ProviderGoogle = "google"
	ProviderDev    = "dev"
)

type OAuth struct {
	cfg *config.Config
}

func NewOAuth(cfg *config.Config) *OAuth {
	return &OAuth{cfg: cfg}
}

func (o *OAuth) Enabled(provider string) bool {
	switch provider {
	case ProviderGithub:
		return o.cfg.GithubClientID != "" && o.cfg.GithubClientSecret != ""
	case ProviderGoogle:
		return o.cfg.GoogleClientID != "" && o.cfg.GoogleClientSecret != ""
	default:
		return false
	}
}

func (o *OAuth) Conf(provider string) (*oauth2.Config, error) {
	if !o.Enabled(provider) {
		return nil, fmt.Errorf("oauth provider %s is not configured", provider)
	}
	redirect := fmt.Sprintf("%s/api/v1/auth/oauth/%s/callback", o.cfg.PublicBaseURL, provider)
	switch provider {
	case ProviderGithub:
		return &oauth2.Config{
			ClientID:     o.cfg.GithubClientID,
			ClientSecret: o.cfg.GithubClientSecret,
			Endpoint:     endpoints.GitHub,
			RedirectURL:  redirect,
			Scopes:       []string{"read:user", "user:email"},
		}, nil
	case ProviderGoogle:
		return &oauth2.Config{
			ClientID:     o.cfg.GoogleClientID,
			ClientSecret: o.cfg.GoogleClientSecret,
			Endpoint:     endpoints.Google,
			RedirectURL:  redirect,
			Scopes:       []string{"openid", "email", "profile"},
		}, nil
	}
	return nil, fmt.Errorf("unknown provider: %s", provider)
}

type statePayload struct {
	Port  int    `json:"port"`
	Exp   int64  `json:"exp"`
	Nonce string `json:"nonce"`
}

// SignState 把桌面端回环端口(可为 0 表示 Web 流程)签进 OAuth state,10 分钟有效。
func (o *OAuth) SignState(port int) (string, error) {
	nonce := make([]byte, 8)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	raw, err := json.Marshal(statePayload{
		Port:  port,
		Exp:   time.Now().Add(10 * time.Minute).Unix(),
		Nonce: hex.EncodeToString(nonce),
	})
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	return body + "." + o.mac(body), nil
}

func (o *OAuth) VerifyState(state string) (int, error) {
	if state == "" {
		return 0, errors.New("empty state")
	}
	var body, sig string
	for i := len(state) - 1; i >= 0; i-- {
		if state[i] == '.' {
			body, sig = state[:i], state[i+1:]
			break
		}
	}
	if body == "" || sig == "" {
		return 0, errors.New("malformed state")
	}
	if !hmac.Equal([]byte(sig), []byte(o.mac(body))) {
		return 0, errors.New("state signature mismatch")
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return 0, errors.New("state payload is not base64")
	}
	var payload statePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0, errors.New("state payload is not json")
	}
	if time.Now().Unix() > payload.Exp {
		return 0, errors.New("state expired")
	}
	if payload.Port != 0 && (payload.Port < 1024 || payload.Port > 65535) {
		return 0, errors.New("state port out of range")
	}
	return payload.Port, nil
}

func (o *OAuth) mac(body string) string {
	h := hmac.New(sha256.New, []byte(o.cfg.JWTSecret))
	h.Write([]byte("oauth-state:" + body))
	return hex.EncodeToString(h.Sum(nil))
}

type Profile struct {
	UID    string
	Email  string
	Name   string
	Avatar string
}

// FetchProfile 用 access token 拉取用户信息。
func (o *OAuth) FetchProfile(ctx context.Context, provider string, token *oauth2.Token) (*Profile, error) {
	conf, err := o.Conf(provider)
	if err != nil {
		return nil, err
	}
	client := conf.Client(ctx, token)
	client.Timeout = 10 * time.Second
	switch provider {
	case ProviderGithub:
		return fetchGithubProfile(client)
	case ProviderGoogle:
		return fetchGoogleProfile(client)
	}
	return nil, fmt.Errorf("unknown provider: %s", provider)
}

func getJSON(client *http.Client, url string, out any) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("%s -> HTTP %d: %s", url, resp.StatusCode, string(body))
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}

func fetchGithubProfile(client *http.Client) (*Profile, error) {
	var user struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := getJSON(client, "https://api.github.com/user", &user); err != nil {
		return nil, err
	}
	if user.Email == "" {
		var emails []struct {
			Email   string `json:"email"`
			Primary bool   `json:"primary"`
		}
		if err := getJSON(client, "https://api.github.com/user/emails", &emails); err == nil {
			for _, e := range emails {
				if e.Primary {
					user.Email = e.Email
					break
				}
			}
		}
	}
	name := user.Name
	if name == "" {
		name = user.Login
	}
	return &Profile{
		UID:    fmt.Sprintf("%d", user.ID),
		Email:  user.Email,
		Name:   name,
		Avatar: user.AvatarURL,
	}, nil
}

func fetchGoogleProfile(client *http.Client) (*Profile, error) {
	var user struct {
		Sub     string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := getJSON(client, "https://openidconnect.googleapis.com/v1/userinfo", &user); err != nil {
		return nil, err
	}
	return &Profile{UID: user.Sub, Email: user.Email, Name: user.Name, Avatar: user.Picture}, nil
}
